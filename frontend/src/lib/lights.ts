import { kelvinToRgb, type Rgb } from "./color";
import type { HaEntityState } from "@/types/ha";

const WARM_WHITE_K = 2700;

/** HA light groups expose their children as `attributes.entity_id: string[]`. */
export function isLightGroup(entity: HaEntityState | undefined): boolean {
  if (!entity) return false;
  const child = entity.attributes.entity_id;
  return Array.isArray(child) && child.every((x) => typeof x === "string");
}

export function supportsColorTemp(entity: HaEntityState | undefined): boolean {
  if (!entity) return false;
  const modes = entity.attributes.supported_color_modes;
  return Array.isArray(modes) && modes.includes("color_temp");
}

/** Derive an approximate RGB for an on light, regardless of its color_mode. */
export function lightRgb(entity: HaEntityState): Rgb | null {
  if (entity.state !== "on") return null;
  const rgb = entity.attributes.rgb_color;
  if (Array.isArray(rgb) && rgb.length === 3 && rgb.every((v) => typeof v === "number")) {
    return [rgb[0] as number, rgb[1] as number, rgb[2] as number];
  }
  const k = entity.attributes.color_temp_kelvin;
  if (typeof k === "number" && Number.isFinite(k)) {
    return kelvinToRgb(k);
  }
  return kelvinToRgb(WARM_WHITE_K);
}

export type Resolver = (id: string) => HaEntityState | undefined;

function controlEntities(entityIds: string[], resolve: Resolver): HaEntityState[] {
  return entityIds
    .map(resolve)
    .filter((e): e is HaEntityState => Boolean(e))
    .filter((e) => !isLightGroup(e));
}

/** Simple RGB mean over on, non-group lights. */
export function averageOnLightRgb(entityIds: string[], resolve: Resolver): Rgb | null {
  const samples: Rgb[] = [];
  for (const e of controlEntities(entityIds, resolve)) {
    const rgb = lightRgb(e);
    if (rgb) samples.push(rgb);
  }
  if (samples.length === 0) return null;
  let r = 0;
  let g = 0;
  let b = 0;
  for (const [rr, gg, bb] of samples) {
    r += rr;
    g += gg;
    b += bb;
  }
  const n = samples.length;
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

/** Average brightness (0–100%) over on, non-group lights. Null if none on. */
export function averageBrightnessPct(entityIds: string[], resolve: Resolver): number | null {
  let sum = 0;
  let n = 0;
  for (const e of controlEntities(entityIds, resolve)) {
    if (e.state !== "on") continue;
    const b = e.attributes.brightness;
    if (typeof b === "number") {
      sum += (b / 255) * 100;
      n += 1;
    }
  }
  return n === 0 ? null : Math.round(sum / n);
}

/** Average colour temperature (K) over on, CT-capable lights. Null if none. */
export function averageColorTempKelvin(entityIds: string[], resolve: Resolver): number | null {
  let sum = 0;
  let n = 0;
  for (const e of controlEntities(entityIds, resolve)) {
    if (e.state !== "on") continue;
    const k = e.attributes.color_temp_kelvin;
    if (typeof k === "number" && Number.isFinite(k)) {
      sum += k;
      n += 1;
    }
  }
  return n === 0 ? null : Math.round(sum / n);
}

export type OnOffCounts = {
  on: number;
  off: number;
  unavailable: number;
  total: number;
};

/** Count on / off / unavailable over non-group lights. */
export function onOffCounts(entityIds: string[], resolve: Resolver): OnOffCounts {
  let on = 0;
  let off = 0;
  let unavailable = 0;
  let total = 0;
  for (const e of controlEntities(entityIds, resolve)) {
    total += 1;
    if (e.state === "on") on += 1;
    else if (e.state === "off") off += 1;
    else unavailable += 1;
  }
  return { on, off, unavailable, total };
}
