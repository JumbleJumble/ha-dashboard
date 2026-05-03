import type { HaEntityState } from "@/types/ha";

export type LightCaps = {
  /** Light supports any kind of brightness (dim, ct, or colour). */
  brightness: boolean;
  /** Light supports colour temperature (kelvin). */
  kelvin: boolean;
  /** Light supports full colour (hs / xy / rgb / rgbw / rgbww). */
  color: boolean;
};

export const NO_CAPS: LightCaps = { brightness: false, kelvin: false, color: false };

/** HA `supported_color_modes` values that count as "full colour". */
const COLOR_MODES = new Set(["hs", "xy", "rgb", "rgbw", "rgbww"]);

/** Map an HA `light.*` entity to our 3-flag capability summary. */
export function lightCaps(entity: HaEntityState | undefined): LightCaps {
  if (!entity) return { ...NO_CAPS };
  const modes = Array.isArray(entity.attributes.supported_color_modes)
    ? (entity.attributes.supported_color_modes as string[])
    : [];
  const hasColor = modes.some((m) => COLOR_MODES.has(m));
  const hasKelvin = modes.includes("color_temp");
  const hasBrightness = hasColor || hasKelvin || modes.includes("brightness");
  return { brightness: hasBrightness, kelvin: hasKelvin, color: hasColor };
}

/** Domain prefix of an entity id (eg "light", "switch"). */
export function entityDomain(entityId: string): string {
  const i = entityId.indexOf(".");
  return i === -1 ? entityId : entityId.slice(0, i);
}
