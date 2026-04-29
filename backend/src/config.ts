import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  Dashboard,
  DashboardsFile,
  Gradient,
  GradientsFile,
  Room,
  RoomConfig,
  RoomDashboard,
  RoomDashboardPage,
  RoomWidget,
  RoomWidgetConfig,
  RoomsFile,
} from "./types/config.js";

const CONFIG_DIR = process.env.CONFIG_DIR ?? join(process.cwd(), "..", "config");

async function readJsonFile<T>(filename: string, fallback: T): Promise<T> {
  const path = join(CONFIG_DIR, filename);
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      console.warn(`[config] ${path} not found; using empty fallback`);
      return fallback;
    }
    throw err;
  }
}

export async function loadGradients(): Promise<Record<string, Gradient>> {
  const file = await readJsonFile<GradientsFile>("gradients.json", { gradients: {} });
  return file.gradients;
}

export async function loadRooms(): Promise<Room[]> {
  const [file, gradients] = await Promise.all([
    readJsonFile<RoomsFile>("rooms.json", { rooms: [] }),
    loadGradients(),
  ]);
  return file.rooms.map((r) => resolveRoom(r, gradients));
}

export async function loadDashboards(): Promise<Dashboard[]> {
  const file = await readJsonFile<DashboardsFile>("dashboards.json", { dashboards: [] });
  return file.dashboards;
}

export function configDir(): string {
  return CONFIG_DIR;
}

/* -------------------------------------------------------------------------- */
/*  Resolution: expand widget refs into fully-inlined widgets                 */
/* -------------------------------------------------------------------------- */

function resolveRoom(room: RoomConfig, gradients: Record<string, Gradient>): Room {
  if (!room.dashboard) return { ...room, dashboard: undefined };
  const dashboard: RoomDashboard = {
    group: room.dashboard.group,
    pages: room.dashboard.pages.map((page): RoomDashboardPage => ({
      label: page.label,
      widgets: page.widgets.map((w) => resolveWidget(w, gradients, room.id)),
    })),
  };
  return { id: room.id, label: room.label, entities: room.entities, dashboard };
}

function resolveWidget(
  w: RoomWidgetConfig,
  gradients: Record<string, Gradient>,
  roomId: string,
): RoomWidget {
  if (w.type !== "gradient") return w;
  if (w.channels) {
    return {
      type: "gradient",
      label: w.label,
      channels: w.channels,
      displayChannels: w.displayChannels,
    };
  }
  if (w.gradient) {
    const g = gradients[w.gradient];
    if (!g) {
      throw new Error(
        `[config] room "${roomId}" references unknown gradient "${w.gradient}"`,
      );
    }
    return {
      type: "gradient",
      label: w.label,
      channels: g.channels,
      displayChannels: g.displayChannels,
    };
  }
  throw new Error(
    `[config] room "${roomId}" has a gradient widget with neither "gradient" ref nor inline "channels"`,
  );
}
