import { Lightbulb, LightbulbOff } from "lucide-react";
import { useGroupToggle } from "@/hooks/useGroupToggle";

type RoomHeaderToggleProps = {
  statsIds: string[];
  controlIds: string[];
};

/** Compact "all lights on/off" toggle that lives in the room header, in the
 *  slot where the room's themed icon used to sit. */
export function RoomHeaderToggle({
  statsIds,
  controlIds,
}: RoomHeaderToggleProps): JSX.Element {
  const { active, stateLabel, toggle } = useGroupToggle(statsIds, controlIds);
  const Icon = active ? Lightbulb : LightbulbOff;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Toggle all lights (${stateLabel})`}
      className={`room-title-icon room-title-toggle ${active ? "is-on" : "is-off"}`}
    >
      <Icon size={22} strokeWidth={2} />
    </button>
  );
}
