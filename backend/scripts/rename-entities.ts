// One-off script to rename ugly auto-generated HA entity IDs to tidy ones.
// Usage from backend/: npm run rename-entities
//
// Uses Node's built-in WebSocket (Node 22+) and the HA `config/entity_registry/update`
// message to change entity_id. HA preserves the device/unique_id underneath, so
// history and device association are kept.

type RenamePair = {
  from: string;
  to: string;
};

const RENAMES: RenamePair[] = [
  { from: "light.signify_netherlands_b_v_lct001", to: "light.lounge_ceiling_x" },
  { from: "light.signify_netherlands_b_v_lct001_2", to: "light.lounge_ceiling_y" },
  { from: "light.signify_netherlands_b_v_lct001_3", to: "light.lounge_ceiling_p" },
  { from: "light.signify_netherlands_b_v_lct001_4", to: "light.lounge_ceiling_z" },
  { from: "light.signify_netherlands_b_v_ltg002", to: "light.hall_door" },
];

type HaMessage = {
  id?: number;
  type: string;
  [key: string]: unknown;
};

const url = process.env.HA_URL;
const token = process.env.HA_TOKEN;

if (!url || !token) {
  console.error("HA_URL and HA_TOKEN must be set (check ../.env)");
  process.exit(1);
}

const wsUrl = url.replace(/^http/, "ws").replace(/\/$/, "") + "/api/websocket";

console.log(`Connecting to ${wsUrl}...`);

const ws = new WebSocket(wsUrl);
let nextId = 1;
const pending = new Map<number, (msg: HaMessage) => void>();

function send(msg: HaMessage): Promise<HaMessage> {
  const id = nextId++;
  const payload: HaMessage = { ...msg, id };
  return new Promise((resolve) => {
    pending.set(id, resolve);
    ws.send(JSON.stringify(payload));
  });
}

ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data as string) as HaMessage;
  if (msg.type === "auth_required") {
    ws.send(JSON.stringify({ type: "auth", access_token: token }));
    return;
  }
  if (msg.type === "auth_ok") {
    void runRenames().catch((err) => {
      console.error("rename run failed:", err);
      ws.close();
      process.exit(1);
    });
    return;
  }
  if (msg.type === "auth_invalid") {
    console.error("HA rejected the token:", msg);
    ws.close();
    process.exit(1);
  }
  if (typeof msg.id === "number" && pending.has(msg.id)) {
    const resolve = pending.get(msg.id);
    pending.delete(msg.id);
    resolve?.(msg);
  }
});

ws.addEventListener("error", (event) => {
  console.error("WebSocket error:", event);
  process.exit(1);
});

ws.addEventListener("close", () => {
  console.log("WebSocket closed.");
});

async function runRenames(): Promise<void> {
  console.log(`Renaming ${RENAMES.length} entities...\n`);
  let ok = 0;
  let skip = 0;
  let fail = 0;
  for (const pair of RENAMES) {
    const result = (await send({
      type: "config/entity_registry/update",
      entity_id: pair.from,
      new_entity_id: pair.to,
    })) as HaMessage & {
      success?: boolean;
      error?: { code?: string; message?: string };
    };
    if (result.success) {
      console.log(`  ✓ ${pair.from.padEnd(48)} → ${pair.to}`);
      ok++;
    } else {
      const code = result.error?.code ?? "unknown";
      const message = result.error?.message ?? JSON.stringify(result);
      if (code === "not_found") {
        console.log(`  · ${pair.from.padEnd(48)}   (already renamed or missing — skipped)`);
        skip++;
      } else {
        console.log(`  ✗ ${pair.from.padEnd(48)}   ${code}: ${message}`);
        fail++;
      }
    }
  }
  console.log(`\n${ok} renamed, ${skip} skipped, ${fail} failed.`);
  ws.close();
  process.exit(fail > 0 ? 1 : 0);
}
