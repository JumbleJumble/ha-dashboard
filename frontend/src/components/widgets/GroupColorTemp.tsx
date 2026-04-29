import { Flame } from "lucide-react";
import { setColorTempKelvin } from "@/ha/services";
import { useLiveSlider } from "@/hooks/useLiveSlider";
import { averageColorTempKelvin } from "@/lib/lights";
import { useEntityStore } from "@/store/entities";

type GroupColorTempProps = {
  /** Entities read to compute the displayed colour temperature. */
  statsIds: string[];
  /** Entities service calls are fired at. Typically a single group id. */
  controlIds: string[];
};

const MIN_K = 2000;
const MAX_K = 6500;
const STEP_K = 50;
/** Round to the slider's step grid so mired round-trip drift doesn't leave
 *  the label on values like "5163 K" when the user picked 5150. */
const snapK = (v: number): number => {
  const snapped = Math.round((v - MIN_K) / STEP_K) * STEP_K + MIN_K;
  return Math.max(MIN_K, Math.min(MAX_K, snapped));
};

export function GroupColorTemp({ statsIds, controlIds }: GroupColorTempProps): JSX.Element {
  const entities = useEntityStore((s) => s.entities);
  const external = averageColorTempKelvin(statsIds, (id) => entities[id]);

  const slider = useLiveSlider({
    externalValue: external,
    fallback: 3200,
    snap: snapK,
    onSend: (v) => {
      void setColorTempKelvin(controlIds, v);
    },
  });

  const label = external == null ? "—" : `${slider.value}K`;

  return (
    <div className="flex flex-col gap-3 rounded-[18px] border border-white/[0.06] bg-ink-card p-4">
      <div className="flex items-center gap-3">
        <div className="entity-icon">
          <Flame size={20} strokeWidth={2} />
        </div>
        <div className="flex-1">
          <div className="text-[15px] font-semibold text-ink-text">Warmth</div>
        </div>
        <div className="text-[18px] font-bold tabular-nums text-ink-text">{label}</div>
      </div>

      <div className="slider-zone">
        <input
          type="range"
          min={MIN_K}
          max={MAX_K}
          step={50}
          value={slider.value}
          onInput={slider.onInput}
          onPointerDown={slider.onPointerDown}
          onPointerUp={slider.onPointerUp}
          onKeyDown={slider.onKeyDown}
          onKeyUp={slider.onKeyUp}
          onChange={() => {
            /* input already handles value changes */
          }}
          className="ha-slider ha-slider--ct"
          aria-label="Colour temperature"
        />
      </div>
    </div>
  );
}
