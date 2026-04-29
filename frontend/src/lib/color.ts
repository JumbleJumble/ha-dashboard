export type Rgb = readonly [number, number, number];

/**
 * Convert a colour temperature in Kelvin to an approximate sRGB triple.
 * Tanner Helland approximation, clamped to 1000K–40000K.
 */
export function kelvinToRgb(kelvin: number): Rgb {
  const t = Math.max(1000, Math.min(40000, kelvin)) / 100;

  let r: number;
  let g: number;
  let b: number;

  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    if (t >= 19) {
      b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
    } else {
      b = 0;
    }
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }

  return [clamp8(r), clamp8(g), clamp8(b)];
}

function clamp8(n: number): number {
  return Math.round(Math.max(0, Math.min(255, n)));
}

export function averageRgb(rgbs: Rgb[]): Rgb | null {
  if (rgbs.length === 0) return null;
  let r = 0;
  let g = 0;
  let b = 0;
  for (const [rr, gg, bb] of rgbs) {
    r += rr;
    g += gg;
    b += bb;
  }
  const n = rgbs.length;
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

export function rgbToCss([r, g, b]: Rgb, alpha = 1): string {
  if (alpha >= 1) return `rgb(${r}, ${g}, ${b})`;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Brighten an RGB toward a punchier accent colour for UI glows without
 *  changing the hue. Very-warm low-K averages otherwise muddy the glow. */
export function brightenForAccent([r, g, b]: Rgb): Rgb {
  const max = Math.max(r, g, b);
  if (max < 1) return [r, g, b];
  const scale = 230 / max;
  return [clamp8(r * scale), clamp8(g * scale), clamp8(b * scale)];
}

export type AccentVars = Record<"--accent" | "--accent-bg" | "--accent-glow", string>;

export function accentVarsFromRgb(rgb: Rgb): AccentVars {
  const bright = brightenForAccent(rgb);
  return {
    "--accent": rgbToCss(bright),
    "--accent-bg": rgbToCss(bright, 0.14),
    "--accent-glow": rgbToCss(bright, 0.4),
  };
}
