import { useMemo, useRef } from "react";
import { Sun } from "lucide-react";
import { setLightState } from "@/ha/services";
import {
  HA_SLIDER_DRAG_TRANSITION_S,
  HA_SLIDER_SETTLE_TRANSITION_S,
} from "@/ha/transitions";
import { useLiveSlider } from "@/hooks/useLiveSlider";
import {
  averageBrightnessPct,
  averageColorTempKelvin,
} from "@/lib/lights";
import {
  channelsToCss,
  inferPosition,
  sampleAll,
  type ChannelValues,
} from "@/lib/gradient";
import { useEntityStore } from "@/store/entities";
import type { GradientChannels } from "@/types/ha";

type GroupGradientProps = {
  label: string;
  channels: GradientChannels;
  /** Optional visual-only channels. If provided, the slider track renders
   *  these instead of `channels`. The slider still sends values derived from
   *  `channels` to the bulbs. */
  displayChannels?: GradientChannels;
  /** Entities read to derive the displayed slider position. */
  statsIds: string[];
  /** Entities service calls are fired at. Typically a single group id. */
  controlIds: string[];
};

const SLIDER_MAX = 1000;

export function GroupGradient({
  label,
  channels,
  displayChannels,
  statsIds,
  controlIds,
}: GroupGradientProps): JSX.Element {
  const entities = useEntityStore((s) => s.entities);

  const bPct = averageBrightnessPct(statsIds, (id) => entities[id]);
  const kK = averageColorTempKelvin(statsIds, (id) => entities[id]);

  const externalSliderValue = useMemo(() => {
    const inferred = inferPosition(channels, {
      brightness: bPct ?? undefined,
      kelvin: kK ?? undefined,
    });
    return inferred == null ? null : Math.round(inferred * SLIDER_MAX);
  }, [channels, bPct, kK]);

  // Track what we last *asked the bulbs for*, per channel, so we can skip
  // channels that haven't changed since the previous tick. In the tungsten
  // gradient, brightness plateaus at 100 for positions 0.6-1.0, so dragging
  // in that range drops to one multicast per tick (kelvin only) instead of
  // two (brightness + kelvin). ZHA issues one ZCL multicast per attribute,
  // so fewer attributes per tick = less inter-bulb skew.
  const lastSentRef = useRef<ChannelValues>({});

  const slider = useLiveSlider({
    externalValue: externalSliderValue,
    fallback: 0,
    onSend: (v) => {
      const next = sampleAll(channels, v / SLIDER_MAX);
      const delta = diffChannels(lastSentRef.current, next);
      if (isEmptyChannels(delta)) return;
      lastSentRef.current = mergeChannels(lastSentRef.current, delta);
      void setLightState(controlIds, delta, HA_SLIDER_DRAG_TRANSITION_S);
    },
    onSettle: (v) => {
      // Bypass the diff: re-assert the full target to catch anything the
      // bulbs silently dropped during the drag tail.
      const full = sampleAll(channels, v / SLIDER_MAX);
      lastSentRef.current = mergeChannels(lastSentRef.current, full);
      void setLightState(controlIds, full, HA_SLIDER_SETTLE_TRANSITION_S);
    },
  });

  const at = slider.value / SLIDER_MAX;
  const preview = sampleAll(channels, at);
  const readout = formatReadout(preview);

  const trackBg = useMemo(
    () => channelsToCss(displayChannels ?? channels),
    [displayChannels, channels],
  );

  return (
    <div className="flex flex-col gap-3 rounded-[18px] border border-white/[0.06] bg-ink-card p-4">
      <div className="flex items-center gap-3">
        <div className="entity-icon">
          <Sun size={20} strokeWidth={2} />
        </div>
        <div className="flex-1">
          <div className="text-[15px] font-semibold text-ink-text">{label}</div>
        </div>
        <div className="text-[13px] font-medium tabular-nums text-ink-muted">{readout}</div>
      </div>

      <div className="slider-zone">
        <div className="ha-gradient-wrap">
          <div className="ha-gradient-track" style={{ backgroundImage: trackBg }} />
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
              /* input already handles value changes */
            }}
            className="ha-slider ha-slider--gradient"
            aria-label={label}
          />
        </div>
      </div>
    </div>
  );
}

function formatReadout(s: ChannelValues): string {
  const parts: string[] = [];
  if (s.brightness != null) parts.push(`${Math.round(s.brightness)}%`);
  if (s.kelvin != null) parts.push(`${Math.round(s.kelvin)}K`);
  if (s.rgb) parts.push(`rgb(${s.rgb.map((c) => Math.round(c)).join(", ")})`);
  return parts.join(" · ");
}

/** Return only the channels whose rounded wire value differs from prev. */
function diffChannels(prev: ChannelValues, next: ChannelValues): ChannelValues {
  const out: ChannelValues = {};
  if (next.brightness != null) {
    const nb = Math.round(next.brightness);
    const pb = prev.brightness != null ? Math.round(prev.brightness) : null;
    if (nb !== pb) out.brightness = next.brightness;
  }
  if (next.kelvin != null) {
    const nk = Math.round(next.kelvin);
    const pk = prev.kelvin != null ? Math.round(prev.kelvin) : null;
    if (nk !== pk) out.kelvin = next.kelvin;
  }
  if (next.rgb) {
    const [nr, ng, nbl] = next.rgb.map(Math.round);
    const p = prev.rgb?.map(Math.round);
    if (!p || p[0] !== nr || p[1] !== ng || p[2] !== nbl) out.rgb = next.rgb;
  }
  if (next.hs) {
    const [nh, ns] = next.hs.map(Math.round);
    const p = prev.hs?.map(Math.round);
    if (!p || p[0] !== nh || p[1] !== ns) out.hs = next.hs;
  }
  return out;
}

function isEmptyChannels(c: ChannelValues): boolean {
  return c.brightness == null && c.kelvin == null && c.rgb == null && c.hs == null;
}

function mergeChannels(a: ChannelValues, b: ChannelValues): ChannelValues {
  return { ...a, ...b };
}
