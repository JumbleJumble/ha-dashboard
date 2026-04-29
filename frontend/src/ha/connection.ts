import {
  createConnection,
  createLongLivedTokenAuth,
  subscribeEntities,
  ERR_INVALID_AUTH,
  ERR_CANNOT_CONNECT,
  ERR_HASS_HOST_REQUIRED,
  type Connection,
  type HassEntities,
} from "home-assistant-js-websocket";
import { useEntityStore } from "@/store/entities";
import type { HaClientConfig, HaEntityState } from "@/types/ha";

let currentConnection: Connection | null = null;

export async function connectToHa(cfg: HaClientConfig): Promise<Connection> {
  const { setStatus, hydrate } = useEntityStore.getState();
  setStatus({ kind: "connecting" });

  try {
    const auth = createLongLivedTokenAuth(cfg.url, cfg.token);
    const conn = await createConnection({ auth });
    currentConnection = conn;

    conn.addEventListener("ready", () => {
      useEntityStore.getState().setStatus({ kind: "connected" });
    });
    conn.addEventListener("disconnected", () => {
      useEntityStore.getState().setStatus({ kind: "reconnecting", attempt: 1 });
    });
    conn.addEventListener("reconnect-error", () => {
      useEntityStore.getState().setStatus({
        kind: "error",
        message: "Reconnect failed — will retry",
      });
    });

    subscribeEntities(conn, (entities) => {
      hydrate(hassEntitiesToList(entities));
      useEntityStore.getState().setStatus({ kind: "connected" });
    });

    return conn;
  } catch (err) {
    const message = describeError(err);
    setStatus({ kind: "error", message });
    throw err;
  }
}

export function getConnection(): Connection | null {
  return currentConnection;
}

function hassEntitiesToList(entities: HassEntities): HaEntityState[] {
  return Object.values(entities).map((e) => ({
    entity_id: e.entity_id,
    state: e.state,
    attributes: e.attributes,
    last_changed: e.last_changed,
    last_updated: e.last_updated,
  }));
}

function describeError(err: unknown): string {
  if (typeof err === "number") {
    switch (err) {
      case ERR_INVALID_AUTH:
        return "Invalid HA token";
      case ERR_CANNOT_CONNECT:
        return "Cannot reach Home Assistant";
      case ERR_HASS_HOST_REQUIRED:
        return "HA URL not provided";
      default:
        return `HA connection error (${err})`;
    }
  }
  if (err instanceof Error) return err.message;
  return "Unknown HA connection error";
}

export async function fetchHaConfig(): Promise<HaClientConfig> {
  const res = await fetch("/api/config/ha");
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Backend returned ${res.status}`);
  }
  return (await res.json()) as HaClientConfig;
}
