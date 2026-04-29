import { kelvinToRgb, type Rgb } from "./color";
import type { GradientChannelStop, GradientChannels } from "@/types/ha";

/** Sample a scalar channel at position `at` (0..1), clamping at the edges. */
export function sampleScalar(stops: GradientChannelStop<number>[], at: number): number | null {
  if (stops.length === 0) return null;
  if (at <= stops[0].at) return stops[0].value;
  if (at >= stops[stops.length - 1].at) return stops[stops.length - 1].value;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (at >= a.at && at <= b.at) {
      const t = (at - a.at) / (b.at - a.at);
      return a.value + (b.value - a.value) * t;
    }
  }
  return stops[stops.length - 1].value;
}

/** Sample a vector channel (rgb / hs) at position `at`, lerping component-wise. */
export function sampleVector<N extends number>(
  stops: GradientChannelStop<number[]>[],
  at: number,
): number[] | null {
  if (stops.length === 0) return null;
  if (at <= stops[0].at) return [...stops[0].value];
  if (at >= stops[stops.length - 1].at) return [...stops[stops.length - 1].value];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (at >= a.at && at <= b.at) {
      const t = (at - a.at) / (b.at - a.at);
      return a.value.map((va, j) => va + (b.value[j] - va) * t);
    }
  }
  return [...stops[stops.length - 1].value];
  // N is a phantom that documents expected arity at call sites.
  void ({} as N);
}

/** Values at position `at`, only including channels that are present. */
export type ChannelValues = {
  brightness?: number;
  kelvin?: number;
  rgb?: [number, number, number];
  hs?: [number, number];
};

export function sampleAll(channels: GradientChannels, at: number): ChannelValues {
  const out: ChannelValues = {};
  if (channels.brightness) {
    const v = sampleScalar(channels.brightness, at);
    if (v != null) out.brightness = v;
  }
  if (channels.kelvin) {
    const v = sampleScalar(channels.kelvin, at);
    if (v != null) out.kelvin = v;
  }
  if (channels.rgb) {
    const v = sampleVector<3>(channels.rgb as GradientChannelStop<number[]>[], at);
    if (v && v.length === 3) out.rgb = [v[0], v[1], v[2]];
  }
  if (channels.hs) {
    const v = sampleVector<2>(channels.hs as GradientChannelStop<number[]>[], at);
    if (v && v.length === 2) out.hs = [v[0], v[1]];
  }
  return out;
}

/** Compute a preview RGB for drawing the track at position `at`. */
export function previewRgbAt(channels: GradientChannels, at: number): Rgb {
  const s = sampleAll(channels, at);
  let base: Rgb;
  if (s.rgb) {
    base = s.rgb;
  } else if (s.kelvin != null) {
    base = kelvinToRgb(s.kelvin);
  } else {
    base = [245, 242, 239];
  }
  const scale = s.brightness != null ? Math.max(0, Math.min(100, s.brightness)) / 100 : 1;
  return [
    Math.round(base[0] * scale),
    Math.round(base[1] * scale),
    Math.round(base[2] * scale),
  ];
}

/** Build a CSS `linear-gradient(...)` by sampling `samples+1` points evenly. */
export function channelsToCss(channels: GradientChannels, samples = 32): string {
  const parts: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const at = i / samples;
    const [r, g, b] = previewRgbAt(channels, at);
    parts.push(`rgb(${r}, ${g}, ${b}) ${(at * 100).toFixed(2)}%`);
  }
  return `linear-gradient(to right, ${parts.join(", ")})`;
}

/** Best-fit inverse: given the current light state, find the slider position
 *  that minimises normalised squared error across all defined channels. */
export function inferPosition(
  channels: GradientChannels,
  current: ChannelValues,
  steps = 200,
): number | null {
  const ranges = collectRanges(channels);
  const active: Array<(at: number) => number | null> = [];

  if (channels.brightness && current.brightness != null) {
    const [lo, hi] = ranges.brightness!;
    const cur = current.brightness;
    active.push((at) => {
      const v = sampleScalar(channels.brightness!, at);
      return v == null ? null : (cur - v) / Math.max(1e-9, hi - lo);
    });
  }
  if (channels.kelvin && current.kelvin != null) {
    const [lo, hi] = ranges.kelvin!;
    const cur = current.kelvin;
    active.push((at) => {
      const v = sampleScalar(channels.kelvin!, at);
      return v == null ? null : (cur - v) / Math.max(1e-9, hi - lo);
    });
  }
  if (active.length === 0) return null;

  let bestAt = 0;
  let bestErr = Infinity;
  for (let i = 0; i <= steps; i++) {
    const at = i / steps;
    let err = 0;
    for (const f of active) {
      const d = f(at);
      if (d == null) {
        err = Infinity;
        break;
      }
      err += d * d;
    }
    if (err < bestErr) {
      bestErr = err;
      bestAt = at;
    }
  }
  return bestAt;
}

function collectRanges(channels: GradientChannels): {
  brightness?: [number, number];
  kelvin?: [number, number];
} {
  const out: { brightness?: [number, number]; kelvin?: [number, number] } = {};
  if (channels.brightness && channels.brightness.length > 0) {
    const vs = channels.brightness.map((s) => s.value);
    out.brightness = [Math.min(...vs), Math.max(...vs)];
  }
  if (channels.kelvin && channels.kelvin.length > 0) {
    const vs = channels.kelvin.map((s) => s.value);
    out.kelvin = [Math.min(...vs), Math.max(...vs)];
  }
  return out;
}
