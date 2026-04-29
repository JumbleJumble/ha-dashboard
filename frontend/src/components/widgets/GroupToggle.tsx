import { Lightbulb } from "lucide-react";
import { useGroupToggle } from "@/hooks/useGroupToggle";

type GroupToggleProps = {
  /** Entities used for display (counts of on/off). */
  statsIds: string[];
  /** Entities service calls are fired at. Typically a single group id. */
  controlIds: string[];
};

export function GroupToggle({ statsIds, controlIds }: GroupToggleProps): JSX.Element {
  const { active, stateLabel, toggle } = useGroupToggle(statsIds, controlIds);

  return (
    <button
      type="button"
      onClick={toggle}
      className={`entity ${active ? "state-on" : "state-off"} w-full !py-5 text-left transition active:scale-[0.99]`}
    >
      <div className="entity-icon">
        <Lightbulb size={22} strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold tracking-[-0.005em] text-ink-text">
          All lights
        </div>
        <div className="mt-0.5 truncate text-[12px] font-medium text-ink-muted">{stateLabel}</div>
      </div>
      <div className="state-pill">{active ? "On" : "Off"}</div>
    </button>
  );
}
