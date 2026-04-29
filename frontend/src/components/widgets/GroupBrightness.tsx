import { Sun } from "lucide-react";
import { setBrightnessPct } from "@/ha/services";
import { useLiveSlider } from "@/hooks/useLiveSlider";
import { averageBrightnessPct } from "@/lib/lights";
import { useEntityStore } from "@/store/entities";

type GroupBrightnessProps = {
  /** Entities read to compute the displayed brightness. */
  statsIds: string[];
  /** Entities service calls are fired at. Typically a single group id. */
  controlIds: string[];
};

export function GroupBrightness({ statsIds, controlIds }: GroupBrightnessProps): JSX.Element {
  const entities = useEntityStore((s) => s.entities);
  const external = averageBrightnessPct(statsIds, (id) => entities[id]);

  const slider = useLiveSlider({
    externalValue: external,
    fallback: 60,
    onSend: (v) => {
      void setBrightnessPct(controlIds, v);
    },
  });

  const label = external == null ? "—" : `${slider.value}%`;

  return (
    <div className="flex flex-col gap-3 rounded-[18px] border border-white/[0.06] bg-ink-card p-4">
      <div className="flex items-center gap-3">
        <div className="entity-icon">
          <Sun size={20} strokeWidth={2} />
        </div>
        <div className="flex-1">
          <div className="text-[15px] font-semibold text-ink-text">Brightness</div>
        </div>
        <div className="text-[18px] font-bold tabular-nums text-ink-text">{label}</div>
      </div>

      <div className="slider-zone">
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
            /* input already handles value changes */
          }}
          className="ha-slider ha-slider--fill"
          style={
            {
              "--fill": `${slider.value}%`,
            } as React.CSSProperties
          }
          aria-label="Brightness"
        />
      </div>
    </div>
  );
}
