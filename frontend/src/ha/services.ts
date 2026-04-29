import { callService } from "home-assistant-js-websocket";
import { getConnection } from "./connection";

/* UI transition tuning: see `./transitions`. Service helpers default to `0`
 * where callers omit `transition` (e.g. throttled sliders). */

function requireConnection() {
  const conn = getConnection();
  if (!conn) throw new Error("Not connected to Home Assistant");
  return conn;
}

export async function turnOn(
  entityIds: string[],
  data: Record<string, unknown> = {},
): Promise<void> {
  if (entityIds.length === 0) return;
  const conn = requireConnection();
  await callService(conn, "light", "turn_on", { ...data, entity_id: entityIds });
}

export async function turnOff(
  entityIds: string[],
  /** Seconds. Defaults to 0 (instant) for slider-driven off paths. */
  transition = 0,
): Promise<void> {
  if (entityIds.length === 0) return;
  const conn = requireConnection();
  const payload: Record<string, unknown> = { entity_id: entityIds };
  if (transition > 0) payload.transition = transition;
  await callService(conn, "light", "turn_off", payload);
}

/** Brightness 0-100 (%). HA's turn_on with brightness auto-powers-on.
 *  `transition` defaults to 0 so rapid slider updates don't queue 400ms Hue
 *  transitions that visibly flick through stale values after release. */
export async function setBrightnessPct(
  entityIds: string[],
  pct: number,
  transition = 0,
): Promise<void> {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  if (clamped === 0) {
    await turnOff(entityIds);
    return;
  }
  await turnOn(entityIds, { brightness_pct: clamped, transition });
}

/** Colour temperature in Kelvin. Only call against lights that support CT. */
export async function setColorTempKelvin(
  entityIds: string[],
  kelvin: number,
  transition = 0,
): Promise<void> {
  const clamped = Math.max(1000, Math.min(10000, Math.round(kelvin)));
  await turnOn(entityIds, { color_temp_kelvin: clamped, transition });
}

/** Set the target temperature on a climate entity (in °C).
 *  NOTE: intentionally no hvac_mode — including it triggers a separate
 *  SetThermostatMode API call on Nest, doubling rate-limit consumption. */
export async function setClimateTemperature(
  entityId: string,
  temperature: number,
): Promise<void> {
  const conn = requireConnection();
  const snapped = Math.round(temperature * 2) / 2;
  const payload = { entity_id: entityId, temperature: snapped };
  console.log("[climate] set_temperature →", JSON.stringify(payload));
  try {
    await callService(conn, "climate", "set_temperature", payload);
    console.log("[climate] set_temperature OK ←", JSON.stringify(payload));
  } catch (err) {
    console.error(
      "[climate] set_temperature FAILED ←",
      JSON.stringify(err, Object.getOwnPropertyNames(err as object)),
      JSON.stringify(payload),
    );
    throw err;
  }
}

/** Bag of channel values for a combined light state update. */
export type LightState = {
  brightness?: number; // 0-100 (%)
  kelvin?: number;
  rgb?: [number, number, number];
  hs?: [number, number];
};

/** Pack multiple channels into a single light.turn_on call so the bulbs
 *  receive one command per drag tick rather than one per channel.
 *  If brightness is 0 the lights are turned off. */
export async function setLightState(
  entityIds: string[],
  state: LightState,
  transition = 0,
): Promise<void> {
  if (entityIds.length === 0) return;
  if (state.brightness != null && Math.round(state.brightness) <= 0) {
    await turnOff(entityIds);
    return;
  }
  const data: Record<string, unknown> = { transition };
  if (state.brightness != null) {
    data.brightness_pct = Math.max(1, Math.min(100, Math.round(state.brightness)));
  }
  // Colour-mode parameters are mutually exclusive. Priority: rgb > hs > kelvin.
  if (state.rgb) {
    data.rgb_color = state.rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))));
  } else if (state.hs) {
    data.hs_color = [
      ((Math.round(state.hs[0]) % 360) + 360) % 360,
      Math.max(0, Math.min(100, Math.round(state.hs[1]))),
    ];
  } else if (state.kelvin != null) {
    data.color_temp_kelvin = Math.max(1000, Math.min(10000, Math.round(state.kelvin)));
  }
  await turnOn(entityIds, data);
}
