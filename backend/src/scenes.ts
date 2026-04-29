import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { configDir } from "./config.js";
import type { Scene, ScenesFile } from "./types/config.js";

const SCENES_FILE = "scenes.json";

function scenesPath(): string {
  return join(configDir(), SCENES_FILE);
}

async function readScenesFile(): Promise<ScenesFile> {
  const path = scenesPath();
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as ScenesFile;
    if (!parsed || !Array.isArray(parsed.scenes)) return { scenes: [] };
    return parsed;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { scenes: [] };
    throw err;
  }
}

async function writeScenesFile(file: ScenesFile): Promise<void> {
  const path = scenesPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(file, null, 2) + "\n", "utf8");
}

export async function listScenes(roomId: string): Promise<Scene[]> {
  const file = await readScenesFile();
  return file.scenes.filter((s) => s.roomId === roomId);
}

export async function getScene(roomId: string, sceneId: string): Promise<Scene | null> {
  const file = await readScenesFile();
  return file.scenes.find((s) => s.roomId === roomId && s.id === sceneId) ?? null;
}

/** Upsert: if a scene with this roomId+id exists, replace; else append. */
export async function upsertScene(scene: Scene): Promise<Scene> {
  validateScene(scene);
  const file = await readScenesFile();
  const idx = file.scenes.findIndex((s) => s.roomId === scene.roomId && s.id === scene.id);
  if (idx >= 0) file.scenes[idx] = scene;
  else file.scenes.push(scene);
  await writeScenesFile(file);
  return scene;
}

export async function deleteScene(roomId: string, sceneId: string): Promise<boolean> {
  const file = await readScenesFile();
  const before = file.scenes.length;
  file.scenes = file.scenes.filter((s) => !(s.roomId === roomId && s.id === sceneId));
  if (file.scenes.length === before) return false;
  await writeScenesFile(file);
  return true;
}

function validateScene(scene: Scene): void {
  if (!scene.id || !scene.name || !scene.roomId) {
    throw new Error("Scene missing id/name/roomId");
  }
  if (!Array.isArray(scene.groups)) throw new Error("Scene groups must be an array");
  const seen = new Set<string>();
  for (const g of scene.groups) {
    if (!g.id) throw new Error("Scene group missing id");
    if (!Array.isArray(g.lights) || g.lights.length === 0) {
      throw new Error(`Scene group ${g.id} must have at least one light`);
    }
    for (const l of g.lights) {
      if (seen.has(l)) throw new Error(`Light ${l} appears in multiple groups`);
      seen.add(l);
    }
  }
}
