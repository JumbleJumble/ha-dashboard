import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Flower2, Lightbulb, LightbulbOff, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import { setLightState, turnOff, turnOn, type LightState } from "@/ha/services";
import {
  HA_DEFAULT_TRANSITION_S,
  HA_SLIDER_DRAG_TRANSITION_S,
  HA_SLIDER_SETTLE_TRANSITION_S,
} from "@/ha/transitions";
import { useLiveSlider } from "@/hooks/useLiveSlider";
import { rgbToCss, type Rgb } from "@/lib/color";
import { useEntityStore } from "@/store/entities";

const KARA_LIGHT_ID = "light.karas_light";

/* ------------------------------ shortcuts ------------------------------ */

type ShortcutId = "normal" | "relax" | "focus" | "bedtime";

type Shortcut =
  | { id: ShortcutId; label: string; mode: "kelvin"; targetK: number; brightness: number }
  | { id: ShortcutId; label: string; mode: "rgb"; rgb: Rgb; brightness: number };

const SHORTCUTS: Shortcut[] = [
  { id: "normal", label: "Normal", mode: "kelvin", targetK: 3000, brightness: 100 },
  { id: "relax", label: "Relax", mode: "kelvin", targetK: 2400, brightness: 100 },
  { id: "focus", label: "Focus", mode: "kelvin", targetK: 5000, brightness: 100 },
  { id: "bedtime", label: "Bedtime", mode: "rgb", rgb: [199, 80, 0], brightness: 10 },
];

/** Hand-tuned swatch fill per shortcut. Flat single colour, chosen to read as
 *  "this is what you'll get at max brightness": Normal is a bright tungsten
 *  off-white, Relax is the same but pushed orange, Focus is a cool blue-
 *  white, Bedtime is the orange-red dim-bulb glow. These are display-only;
 *  the actual emitted colour comes from `targetK` / `rgb` on the shortcut. */
const SHORTCUT_SWATCH_RGB: Record<ShortcutId, Rgb> = {
  normal: [255, 240, 215],
  relax: [255, 210, 160],
  focus: [215, 232, 255],
  bedtime: [199, 80, 0],
};

function shortcutSwatchBg(s: Shortcut): string {
  return rgbToCss(SHORTCUT_SWATCH_RGB[s.id]);
}

/** Linear ramp to 2000K as brightness drops: k(b) = 2000 + (target - 2000) * b/100. */
function kelvinForBrightness(targetK: number, brightnessPct: number): number {
  const b = Math.max(0, Math.min(100, brightnessPct));
  return Math.round(2000 + (targetK - 2000) * (b / 100));
}

/* ------------------------------ pinks ------------------------------ */

type Pink = { name: string; rgb: Rgb };

const PINKS: Pink[] = [
  { name: "Blush mist", rgb: [255, 232, 234] },
  { name: "Petal", rgb: [255, 195, 210] },
  { name: "Powder", rgb: [250, 180, 200] },
  { name: "Sweet pea", rgb: [255, 160, 185] },
  { name: "Rose", rgb: [245, 140, 175] },
  { name: "Bloom", rgb: [235, 115, 160] },
  { name: "Carnation", rgb: [220, 95, 150] },
  { name: "Peony", rgb: [210, 75, 140] },
];

/* ------------------------------ two-stop gradients ------------------------------ */

type GradientDef = {
  id: string;
  name: string;
  /** Colour at position 0 (slider-left / swatch-bottom). */
  bottom: Rgb;
  /** Colour at position 1 (slider-right / swatch-top). */
  top: Rgb;
};

const GRADIENTS: GradientDef[] = [
  { id: "pink-blue", name: "Pink → Blue", bottom: [255, 150, 200], top: [150, 195, 255] },
  { id: "green-yellow", name: "Green → Yellow", bottom: [170, 220, 150], top: [255, 230, 140] },
  { id: "purple-red", name: "Purple → Red", bottom: [205, 100, 215], top: [240, 100, 110] },
];
const GRADIENT_BY_ID: Record<string, GradientDef> = Object.fromEntries(
  GRADIENTS.map((g) => [g.id, g]),
);

function gradRgb(g: GradientDef, pos: number): Rgb {
  const t = Math.max(0, Math.min(1, pos));
  return [
    Math.round(g.bottom[0] + (g.top[0] - g.bottom[0]) * t),
    Math.round(g.bottom[1] + (g.top[1] - g.bottom[1]) * t),
    Math.round(g.bottom[2] + (g.top[2] - g.bottom[2]) * t),
  ];
}

function verticalGradientBg(g: GradientDef): string {
  return `linear-gradient(to top, ${rgbToCss(g.bottom)} 0%, ${rgbToCss(g.top)} 100%)`;
}

function horizontalGradientBg(g: GradientDef): string {
  return `linear-gradient(to right, ${rgbToCss(g.bottom)} 0%, ${rgbToCss(g.top)} 100%)`;
}

const RAINBOW_BG =
  "linear-gradient(90deg, #ffb3ba 0%, #ffdfba 18%, #fff7ba 34%, #baffc9 52%, #bae1ff 70%, #d5baff 86%, #ffbaff 100%)";

/* ------------------------------ selection ------------------------------ */

type Selection =
  | { kind: "none" }
  | { kind: "shortcut"; id: ShortcutId }
  | { kind: "pink"; idx: number }
  | { kind: "gradient"; id: string }
  | { kind: "picker"; rgb: Rgb };

const GRADIENT_SLIDER_MAX = 1000;

/* ------------------------------ page ------------------------------ */

export function KaraRoomPage(): JSX.Element {
  const entity = useEntityStore((s) => s.entities[KARA_LIGHT_ID]);
  const controlIds = useMemo(() => [KARA_LIGHT_ID], []);

  // index.html sets viewport-fit=cover. On iOS the status-bar area is
  // painted by <html>'s background (not <body>'s), so we flip the class on
  // both the documentElement and the body to keep the gradient running
  // edge-to-edge through the unsafe area and any overscroll bounce.
  useEffect(() => {
    document.documentElement.classList.add("kara-body");
    document.body.classList.add("kara-body");
    return () => {
      document.documentElement.classList.remove("kara-body");
      document.body.classList.remove("kara-body");
    };
  }, []);

  const isOn = entity?.state === "on";
  const haBrightness255 = entity?.attributes.brightness as number | undefined;
  const haBrightnessPct =
    typeof haBrightness255 === "number"
      ? Math.round((haBrightness255 / 255) * 100)
      : null;

  /* ---- local state ---- */

  const [selection, setSelection] = useState<Selection>({ kind: "none" });

  /** The "commanded" brightness — what the UI considers the current target.
   *  Seeded from HA on first read, updated by shortcut taps and by the
   *  brightness slider itself. */
  const [brightness, setBrightness] = useState<number>(80);
  /** Bumps every time a shortcut prescribes a brightness, forcing the
   *  brightness slider to remount with the new fallback. */
  const [brightnessVer, setBrightnessVer] = useState(0);
  const brightnessSeededRef = useRef(false);
  useEffect(() => {
    if (!brightnessSeededRef.current && haBrightnessPct != null) {
      brightnessSeededRef.current = true;
      setBrightness(haBrightnessPct);
      setBrightnessVer((v) => v + 1);
    }
  }, [haBrightnessPct]);

  /** Position along the currently-selected gradient (0..1). Resets on every
   *  new gradient pick. */
  const [gradientPos, setGradientPos] = useState(0.5);

  /** Most recently chosen custom colour from the rainbow picker. */
  const [pickerRgb, setPickerRgb] = useState<Rgb>([255, 200, 230]);

  /* ---- keep a ref of current state so slider callbacks see the latest ---- */

  const stateRef = useRef({ selection, brightness, gradientPos, pickerRgb });
  stateRef.current = { selection, brightness, gradientPos, pickerRgb };

  const buildFromCurrent = (overrides: Partial<typeof stateRef.current> = {}): LightState => {
    const s = { ...stateRef.current, ...overrides };
    return buildLightState(s.selection, s.brightness, s.gradientPos, s.pickerRgb);
  };

  const applyFromCurrent = (
    overrides: Partial<typeof stateRef.current> = {},
    transition = HA_DEFAULT_TRANSITION_S,
  ) => {
    const ls = buildFromCurrent(overrides);
    void setLightState(controlIds, ls, transition);
  };

  /* ---- tap handlers ---- */

  const pickShortcut = (s: Shortcut) => {
    setSelection({ kind: "shortcut", id: s.id });
    setBrightness(s.brightness);
    setBrightnessVer((v) => v + 1);
    applyFromCurrent({
      selection: { kind: "shortcut", id: s.id },
      brightness: s.brightness,
    });
  };

  const pickPink = (idx: number) => {
    setSelection({ kind: "pink", idx });
    applyFromCurrent({ selection: { kind: "pink", idx } });
  };

  const pickGradient = (g: GradientDef) => {
    setSelection({ kind: "gradient", id: g.id });
    setGradientPos(0.5);
    applyFromCurrent({
      selection: { kind: "gradient", id: g.id },
      gradientPos: 0.5,
    });
  };

  const onPickerChange = (hex: string) => {
    const rgb = hexToRgb(hex);
    if (!rgb) return;
    setPickerRgb(rgb);
    setSelection({ kind: "picker", rgb });
    applyFromCurrent({ selection: { kind: "picker", rgb }, pickerRgb: rgb });
  };

  /* ---- sliders ---- */

  // Brightness slider: drag → update brightness + apply. Key on brightnessVer
  // so each shortcut tap gives it a fresh fallback & resets ownership.
  const brightnessKey = `bright-${brightnessVer}`;

  const gradientKey =
    selection.kind === "gradient" ? `grad-${selection.id}` : null;

  return (
    <div className="kara-theme kara-page">
      <div className="kara-page-inner">
        <Header isOn={isOn} controlIds={controlIds} />

        <Card title="Brightness" decoration>
          <div className="slider-zone">
            <BrightnessSlider
              key={brightnessKey}
              initial={brightness}
              onChange={(v) => {
                setBrightness(v);
                applyFromCurrent({ brightness: v }, HA_SLIDER_DRAG_TRANSITION_S);
              }}
              onSettle={(v) => {
                setBrightness(v);
                applyFromCurrent({ brightness: v }, HA_SLIDER_SETTLE_TRANSITION_S);
              }}
            />
          </div>
        </Card>

        <Card title="Scenes" decoration>
          <div className="kara-shortcut-row">
            {SHORTCUTS.map((s) => {
              const selected =
                selection.kind === "shortcut" && selection.id === s.id;
              // Light-background swatches (Normal/Relax/Focus) get a dark
              // pink label; the dark Bedtime swatch gets white.
              const labelTone = s.mode === "kelvin" ? "is-dark" : "is-light";
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => pickShortcut(s)}
                  className={`kara-swatch kara-shortcut ${selected ? "is-selected" : ""}`}
                  style={{ background: shortcutSwatchBg(s) }}
                  aria-label={s.label}
                  title={s.label}
                >
                  <span className={`kara-shortcut-label ${labelTone}`}>
                    {s.label}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>

        <Card title="Palette" decoration>
          <div className="kara-palette">
            {PINKS.map((p, i) => {
              const selected =
                selection.kind === "pink" && selection.idx === i;
              return (
                <button
                  key={`pink-${i}`}
                  type="button"
                  onClick={() => pickPink(i)}
                  aria-label={p.name}
                  title={p.name}
                  className={`kara-swatch ${selected ? "is-selected" : ""}`}
                  style={{ background: rgbToCss(p.rgb) }}
                />
              );
            })}
            {GRADIENTS.map((g) => {
              const selected =
                selection.kind === "gradient" && selection.id === g.id;
              return (
                <button
                  key={`grad-${g.id}`}
                  type="button"
                  onClick={() => pickGradient(g)}
                  aria-label={g.name}
                  title={g.name}
                  className={`kara-swatch ${selected ? "is-selected" : ""}`}
                  style={{ background: verticalGradientBg(g) }}
                />
              );
            })}
            <RainbowSwatch
              selected={selection.kind === "picker"}
              value={pickerRgb}
              onChange={onPickerChange}
            />
          </div>

          {selection.kind === "gradient" && gradientKey ? (
            <>
              <div className="kara-slider-label">
                <span>{GRADIENT_BY_ID[selection.id].name}</span>
              </div>
              <div className="slider-zone">
                <GradientPositionSlider
                  key={gradientKey}
                  gradient={GRADIENT_BY_ID[selection.id]}
                  initial={0.5}
                  onChange={(pos) => {
                    setGradientPos(pos);
                    applyFromCurrent({ gradientPos: pos }, HA_SLIDER_DRAG_TRANSITION_S);
                  }}
                  onSettle={(pos) => {
                    setGradientPos(pos);
                    applyFromCurrent({ gradientPos: pos }, HA_SLIDER_SETTLE_TRANSITION_S);
                  }}
                />
              </div>
            </>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------ state builder ------------------------------ */

function buildLightState(
  selection: Selection,
  brightness: number,
  gradientPos: number,
  pickerRgb: Rgb,
): LightState {
  switch (selection.kind) {
    case "none":
      return { brightness };
    case "shortcut": {
      const s = SHORTCUTS.find((x) => x.id === selection.id);
      if (!s) return { brightness };
      if (s.mode === "kelvin") {
        return { brightness, kelvin: kelvinForBrightness(s.targetK, brightness) };
      }
      return { brightness, rgb: [...s.rgb] as [number, number, number] };
    }
    case "pink":
      return { brightness, rgb: [...PINKS[selection.idx].rgb] as [number, number, number] };
    case "gradient": {
      const g = GRADIENT_BY_ID[selection.id];
      if (!g) return { brightness };
      return { brightness, rgb: [...gradRgb(g, gradientPos)] as [number, number, number] };
    }
    case "picker":
      return { brightness, rgb: [...pickerRgb] as [number, number, number] };
  }
}

/* ------------------------------ sliders ------------------------------ */

function BrightnessSlider({
  initial,
  onChange,
  onSettle,
}: {
  initial: number;
  onChange: (v: number) => void;
  onSettle: (v: number) => void;
}): JSX.Element {
  const slider = useLiveSlider({
    externalValue: null,
    fallback: initial,
    onSend: onChange,
    onSettle,
  });
  return (
    <input
      type="range"
      min={0}
      max={100}
      step={1}
      value={slider.value}
      onInput={slider.onInput}
      onPointerDown={slider.onPointerDown}
      onPointerUp={slider.onPointerUp}
      onKeyDown={slider.onKeyDown}
      onKeyUp={slider.onKeyUp}
      onChange={() => {
        /* onInput handles value changes */
      }}
      className="ha-slider kara-slider kara-slider--plain"
      aria-label="Brightness"
    />
  );
}

function GradientPositionSlider({
  gradient,
  initial,
  onChange,
  onSettle,
}: {
  gradient: GradientDef;
  initial: number;
  onChange: (pos: number) => void;
  onSettle: (pos: number) => void;
}): JSX.Element {
  const slider = useLiveSlider({
    externalValue: null,
    fallback: Math.round(initial * GRADIENT_SLIDER_MAX),
    onSend: (v) => onChange(v / GRADIENT_SLIDER_MAX),
    onSettle: (v) => onSettle(v / GRADIENT_SLIDER_MAX),
  });
  const trackBg = horizontalGradientBg(gradient);
  return (
    <div className="ha-gradient-wrap">
      <div className="ha-gradient-track" style={{ backgroundImage: trackBg }} />
      <input
        type="range"
        min={0}
        max={GRADIENT_SLIDER_MAX}
        step={1}
        value={slider.value}
        onInput={slider.onInput}
        onPointerDown={slider.onPointerDown}
        onPointerUp={slider.onPointerUp}
        onKeyDown={slider.onKeyDown}
        onKeyUp={slider.onKeyUp}
        onChange={() => {
          /* onInput handles value changes */
        }}
        className="ha-slider ha-slider--gradient kara-slider"
        aria-label={gradient.name}
      />
    </div>
  );
}

/* ------------------------------ rainbow swatch (native picker) ------------------------------ */

function RainbowSwatch({
  selected,
  value,
  onChange,
}: {
  selected: boolean;
  value: Rgb;
  onChange: (hex: string) => void;
}): JSX.Element {
  const hex = rgbToHex(value);
  return (
    <div
      className={`kara-swatch kara-rainbow ${selected ? "is-selected" : ""}`}
      style={{ background: RAINBOW_BG }}
      aria-label="Custom colour"
      title="Custom colour"
    >
      <input
        type="color"
        value={hex}
        onChange={(e) => onChange(e.currentTarget.value)}
        className="kara-color-input"
        aria-label="Pick a colour"
      />
    </div>
  );
}

/* ------------------------------ header / card ------------------------------ */

function Header({
  isOn,
  controlIds,
}: {
  isOn: boolean;
  controlIds: string[];
}): JSX.Element {
  const Icon = isOn ? Lightbulb : LightbulbOff;
  const onToggle = () => {
    // Drive the toggle from the single entity's state directly so it works
    // even when HA reports the lamp as a light-group (kitchen's shared
    // `useGroupToggle` filters groups out of its counts and would no-op).
    const t = HA_DEFAULT_TRANSITION_S;
    if (isOn) void turnOff(controlIds, t);
    else void turnOn(controlIds, { transition: t });
  };
  return (
    <div className="kara-header">
      <Link to="/" aria-label="Back" className="kara-icon-btn">
        <ArrowLeft size={22} strokeWidth={2} />
      </Link>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <button
          type="button"
          onClick={onToggle}
          aria-label={`Toggle lamp (${isOn ? "on" : "off"})`}
          className={`room-title-icon room-title-toggle ${isOn ? "is-on" : "is-off"}`}
        >
          <Icon size={22} strokeWidth={2} />
        </button>
        <div className="min-w-0">
          <h1 className="kara-title">Kara's Room</h1>
          <div className="kara-subtitle">{isOn ? "glowing" : "dim"}</div>
        </div>
      </div>
      <Link
        to={`/room/kara/diagnostics`}
        aria-label="Diagnostics"
        className="kara-icon-btn kara-icon-btn--dim"
      >
        <Settings size={18} strokeWidth={2} />
      </Link>
    </div>
  );
}

function Card({
  title,
  decoration,
  children,
}: {
  title: string;
  decoration?: boolean;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section className="kara-card">
      <div className="kara-card-header">
        {decoration ? (
          <Flower2 size={14} strokeWidth={1.75} className="kara-card-flower" />
        ) : null}
        <h2 className="kara-card-title">{title}</h2>
        {decoration ? (
          <Flower2 size={14} strokeWidth={1.75} className="kara-card-flower" />
        ) : null}
      </div>
      <div className="kara-card-body">{children}</div>
    </section>
  );
}

/* ------------------------------ helpers ------------------------------ */

function hexToRgb(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function rgbToHex([r, g, b]: Rgb): string {
  const toHex = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
