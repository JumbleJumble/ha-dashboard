import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Settings } from "lucide-react";
import { RoomHeader } from "@/components/RoomHeader";
import { RoomHeaderToggle } from "@/components/RoomHeaderToggle";
import { setLightState, turnOff } from "@/ha/services";
import {
  HA_DEFAULT_TRANSITION_S,
  HA_SLIDER_DRAG_TRANSITION_S,
  HA_SLIDER_SETTLE_TRANSITION_S,
} from "@/ha/transitions";
import { useLiveSlider } from "@/hooks/useLiveSlider";
import { useRoomAccent } from "@/hooks/useRoomAccent";
import { channelsToCss } from "@/lib/gradient";
import { useEntityStore } from "@/store/entities";
import type { GradientChannels } from "@/types/ha";

/* ------------------------------ constants ------------------------------ */

const KITCHEN_GROUP_ID =
  "light.home_assistant_connect_zbt_2_zig_group_kitchen_lights";

/** Physical zones in the kitchen, one end → other end. Mirrors AGENTS.md.
 *  These aren't formalised anywhere else in the config — they exist here so
 *  that scene renderers can set different targets per area. */
const ZONES = {
  table: [
    "light.hall_door",
    "light.table_a",
    "light.table_b",
    "light.table_c",
    "light.table_d",
  ],
  gap: ["light.gap_a", "light.gap_b"],
  bar: ["light.bar_a", "light.bar_b"],
  cooking: [
    "light.hob_a",
    "light.hob_b",
    "light.sink_a",
    "light.sink_b",
    "light.utility_door",
  ],
} as const;

const KITCHEN_ENTITIES: string[] = [
  ...ZONES.table,
  ...ZONES.gap,
  ...ZONES.bar,
  ...ZONES.cooking,
];

const SLIDER_MAX = 1000;
const MIN_KELVIN = 2000;

/* ------------------------------ scenes ------------------------------ */

type SceneId = "blasting" | "normal" | "mix" | "dinner";

type Scene = {
  id: SceneId;
  label: string;
  /** Background for the scene swatch button (colour or gradient). */
  swatchBg: string;
  /** Slider track gradient — visually suggests what the slider controls. */
  trackChannels: GradientChannels;
};

// Same visual trick used by the site-wide tungsten gradient: the track
// renders a cooler-looking kelvin range (1900–8500K) than the bulbs actually
// receive (2000–5000K) so the right end of the slider reads as "really blue".
const BLASTING_TRACK: GradientChannels = {
  brightness: [
    { at: 0, value: 0 },
    { at: 0.6, value: 100 },
  ],
  kelvin: [
    { at: 0, value: 1900 },
    { at: 1, value: 8500 },
  ],
};

const NORMAL_TRACK: GradientChannels = {
  brightness: [
    { at: 0, value: 0 },
    { at: 1, value: 100 },
  ],
  kelvin: [
    { at: 0, value: 1900 },
    { at: 1, value: 3200 },
  ],
};

// Mix has a 25% floor below which all non-table zones are off, so the track
// climbs slowly for the first quarter then cools quickly to an averaged mid
// kelvin at the top.
const MIX_TRACK: GradientChannels = {
  brightness: [
    { at: 0, value: 0 },
    { at: 0.25, value: 18 },
    { at: 1, value: 100 },
  ],
  kelvin: [
    { at: 0, value: 1900 },
    { at: 0.25, value: 2400 },
    { at: 1, value: 5000 },
  ],
};

const DINNER_TRACK: GradientChannels = {
  brightness: [
    { at: 0, value: 0 },
    { at: 1, value: 65 },
  ],
  kelvin: [
    { at: 0, value: 1900 },
    { at: 1, value: 2700 },
  ],
};

const SCENES: Scene[] = [
  {
    id: "blasting",
    label: "Blasting",
    // Cool-white swatch to read as "daylight".
    swatchBg: "#dbe8ff",
    trackChannels: BLASTING_TRACK,
  },
  {
    id: "normal",
    label: "Normal",
    // Warm tungsten cream.
    swatchBg: "#ffefc8",
    trackChannels: NORMAL_TRACK,
  },
  {
    id: "mix",
    label: "Mix",
    // Four-stop horizontal gradient hinting at the per-zone warm→cool ramp.
    swatchBg:
      "linear-gradient(to right, #ffe9bc 0%, #ffeecf 34%, #e6edff 66%, #cfddff 100%)",
    trackChannels: MIX_TRACK,
  },
  {
    id: "dinner",
    label: "Dinner",
    // Warm dim-dining-room glow.
    swatchBg: "#e89858",
    trackChannels: DINNER_TRACK,
  },
];

/* ------------------------------ zone-state renderers ------------------------------ */

type ZoneState =
  | { on: true; brightness: number; kelvin: number }
  | { on: false };

type ZoneStates = {
  table: ZoneState;
  gap: ZoneState;
  bar: ZoneState;
  cooking: ZoneState;
};

/** Linear interpolation from (0% / 2000K) to baseline over u ∈ [0, 1]. */
function lerpOn(
  baseline: { brightness: number; kelvin: number },
  u: number,
): ZoneState {
  const u2 = Math.max(0, Math.min(1, u));
  const brightness = baseline.brightness * u2;
  if (brightness <= 0) return { on: false };
  const kelvin = MIN_KELVIN + (baseline.kelvin - MIN_KELVIN) * u2;
  return { on: true, brightness, kelvin };
}

/** Blasting: tungsten gradient applied room-wide. Matches the site-wide
 *  tungsten gradient: brightness plateaus at 100 for t ≥ 0.6, kelvin ramps
 *  2000→5000 linearly. */
function renderBlasting(t: number): ZoneStates {
  const brightness = Math.min(100, (t / 0.6) * 100);
  const kelvin = 2000 + (5000 - 2000) * t;
  const s: ZoneState =
    brightness <= 0 ? { on: false } : { on: true, brightness, kelvin };
  return { table: s, gap: s, bar: s, cooking: s };
}

/** Normal: bright tungsten white room-wide. Colour temp drops to 2000K as
 *  brightness drops. */
function renderNormal(t: number): ZoneStates {
  const s = lerpOn({ brightness: 100, kelvin: 3000 }, t);
  return { table: s, gap: s, bar: s, cooking: s };
}

/** Mix: warm over the table, daylight over the cooking end, primitive
 *  gradient through gap/bar. When dimming: table continues to 0 at t=0 while
 *  the rest bottom out at t=0.25. */
function renderMix(t: number): ZoneStates {
  const tableU = t;
  const otherU = Math.max(0, (t - 0.25) / 0.75);
  return {
    table: lerpOn({ brightness: 100, kelvin: 3000 }, tableU),
    gap: lerpOn({ brightness: 100, kelvin: 3667 }, otherU),
    bar: lerpOn({ brightness: 100, kelvin: 5000 }, otherU),
    cooking: lerpOn({ brightness: 100, kelvin: 5000 }, otherU),
  };
}

/** Dinner: only table and bar are on; gap and cooking are always off. All
 *  on-lights dim uniformly toward 2000K / 0%. */
function renderDinner(t: number): ZoneStates {
  return {
    table: lerpOn({ brightness: 80, kelvin: 2700 }, t),
    gap: { on: false },
    bar: lerpOn({ brightness: 50, kelvin: 2500 }, t),
    cooking: { on: false },
  };
}

function renderScene(scene: SceneId, t: number): ZoneStates {
  switch (scene) {
    case "blasting":
      return renderBlasting(t);
    case "normal":
      return renderNormal(t);
    case "mix":
      return renderMix(t);
    case "dinner":
      return renderDinner(t);
  }
}

/* ------------------------------ dispatch ------------------------------ */

type ZoneFp = Record<keyof ZoneStates, string>;

function fpZone(z: ZoneState): string {
  if (!z.on) return "off";
  return `on:${Math.round(z.brightness)}:${Math.round(z.kelvin)}`;
}

/** Send the minimum set of service calls needed to reach `zones`, skipping
 *  any zone whose rounded state is unchanged from `prev`.
 *
 *  - Blasting / Normal collapse to a single call against the kitchen ZHA
 *    group (all four zones share one state), which reduces mid-drag zigbee
 *    traffic to a single multicast per tick.
 *  - Mix / Dinner fan out per-zone, batching "off" zones into one turn_off. */
function dispatchZones(
  scene: SceneId,
  zones: ZoneStates,
  prev: ZoneFp | null,
  transition: number,
): ZoneFp {
  if (scene === "blasting" || scene === "normal") {
    const state = zones.table;
    const fp = fpZone(state);
    const prevFp = prev?.table ?? null;
    const unchanged: ZoneFp = { table: fp, gap: fp, bar: fp, cooking: fp };
    if (fp === prevFp) return unchanged;
    if (!state.on) {
      void turnOff([KITCHEN_GROUP_ID], transition);
    } else {
      void setLightState(
        [KITCHEN_GROUP_ID],
        { brightness: state.brightness, kelvin: state.kelvin },
        transition,
      );
    }
    return unchanged;
  }

  const next: ZoneFp = { table: "", gap: "", bar: "", cooking: "" };
  const offBatch: string[] = [];
  for (const name of ["table", "gap", "bar", "cooking"] as const) {
    const state = zones[name];
    const fp = fpZone(state);
    next[name] = fp;
    if (prev && fp === prev[name]) continue;
    if (!state.on) {
      offBatch.push(...ZONES[name]);
    } else {
      void setLightState(
        [...ZONES[name]],
        { brightness: state.brightness, kelvin: state.kelvin },
        transition,
      );
    }
  }
  if (offBatch.length > 0) void turnOff(offBatch, transition);
  return next;
}

/* ------------------------------ page ------------------------------ */

export function KitchenRoomPage(): JSX.Element {
  const entities = useEntityStore((s) => s.entities);
  const dynamicAccent = useRoomAccent(KITCHEN_ENTITIES);

  const subtitle = useMemo(() => {
    let on = 0;
    let total = 0;
    let loaded = 0;
    for (const id of KITCHEN_ENTITIES) {
      total += 1;
      const e = entities[id];
      if (!e) continue;
      loaded += 1;
      if (e.state === "on") on += 1;
    }
    if (loaded === 0) return `${total} entities`;
    if (on === 0) return "all off";
    return `${on} of ${total} on`;
  }, [entities]);

  const controlIds = useMemo(() => [KITCHEN_GROUP_ID], []);

  const [sceneId, setSceneId] = useState<SceneId | null>(null);
  const [sliderVer, setSliderVer] = useState(0);

  /** What we most recently asked the bulbs for, per zone. Lets drag ticks
   *  skip zones whose rounded state hasn't changed. Cleared on scene switch
   *  so the first apply fully re-asserts the new scene. */
  const lastSentRef = useRef<ZoneFp | null>(null);

  const applyScene = (scene: SceneId, t: number, transition: number) => {
    const zones = renderScene(scene, t);
    lastSentRef.current = dispatchZones(
      scene,
      zones,
      lastSentRef.current,
      transition,
    );
  };

  const pickScene = (id: SceneId) => {
    setSceneId(id);
    setSliderVer((v) => v + 1);
    lastSentRef.current = null;
    applyScene(id, 1, HA_DEFAULT_TRANSITION_S);
  };

  const activeScene = sceneId
    ? (SCENES.find((s) => s.id === sceneId) ?? null)
    : null;

  return (
    <div
      className="accent-kitchen mx-auto flex max-w-xl flex-col px-5 pb-10 pt-6"
      style={(dynamicAccent as React.CSSProperties | undefined) ?? undefined}
    >
      <RoomHeader
        leading={
          <RoomHeaderToggle
            statsIds={KITCHEN_ENTITIES}
            controlIds={controlIds}
          />
        }
        title="Kitchen"
        subtitle={subtitle}
        backTo="/"
        trailing={
          <Link
            to="/room/kitchen/diagnostics"
            aria-label="Diagnostics"
            className="-mr-1 inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-muted/60 transition hover:text-ink-text active:bg-white/5"
          >
            <Settings size={18} strokeWidth={2} />
          </Link>
        }
      />

      <div className="flex flex-col gap-3">
        <section className="flex flex-col gap-4 rounded-[18px] border border-white/[0.06] bg-ink-card p-4">
          <div className="scene-row">
            {SCENES.map((s) => {
              const selected = sceneId === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => pickScene(s.id)}
                  className={`scene-swatch ${selected ? "is-selected" : ""}`}
                  style={{ background: s.swatchBg }}
                  aria-label={s.label}
                  aria-pressed={selected}
                  title={s.label}
                >
                  <span className="scene-swatch-label">{s.label}</span>
                </button>
              );
            })}
          </div>

          {activeScene ? (
            <SceneSlider
              key={`slider-${activeScene.id}-${sliderVer}`}
              trackChannels={activeScene.trackChannels}
              onDrag={(t) =>
                applyScene(activeScene.id, t, HA_SLIDER_DRAG_TRANSITION_S)
              }
              onSettle={(t) =>
                applyScene(activeScene.id, t, HA_SLIDER_SETTLE_TRANSITION_S)
              }
            />
          ) : null}
        </section>
      </div>
    </div>
  );
}

/* ------------------------------ slider ------------------------------ */

function SceneSlider({
  trackChannels,
  onDrag,
  onSettle,
}: {
  trackChannels: GradientChannels;
  onDrag: (t: number) => void;
  onSettle: (t: number) => void;
}): JSX.Element {
  const slider = useLiveSlider({
    externalValue: null,
    fallback: SLIDER_MAX,
    onSend: (v) => onDrag(v / SLIDER_MAX),
    onSettle: (v) => onSettle(v / SLIDER_MAX),
  });
  const trackBg = useMemo(() => channelsToCss(trackChannels), [trackChannels]);
  return (
    <div className="slider-zone">
      <div className="ha-gradient-wrap">
        <div
          className="ha-gradient-track"
          style={{ backgroundImage: trackBg }}
        />
        <input
          type="range"
          min={0}
          max={SLIDER_MAX}
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
          className="ha-slider ha-slider--gradient"
          aria-label="Scene intensity"
        />
      </div>
    </div>
  );
}
