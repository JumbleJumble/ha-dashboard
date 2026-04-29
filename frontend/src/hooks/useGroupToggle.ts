import { useCallback } from "react";
import { turnOff, turnOn } from "@/ha/services";
import { HA_DEFAULT_TRANSITION_S } from "@/ha/transitions";
import { onOffCounts, type OnOffCounts } from "@/lib/lights";
import { useEntityStore } from "@/store/entities";

export type UseGroupToggle = {
  counts: OnOffCounts;
  active: boolean;
  allOn: boolean;
  allOff: boolean;
  /** Human-readable state, e.g. "All on", "3 of 8 on". */
  stateLabel: string;
  /** Tap semantics:
   *   all on        -> turn everything off
   *   all off       -> turn everything on
   *   majority on   -> bring stragglers up (turn all on)
   *   otherwise     -> kill the rest (turn all off)
   */
  toggle: () => Promise<void>;
};

/**
 * Shared on/off logic for "all lights in this room" controls. Used by the
 * full GroupToggle widget and the compact toggle icon in the room header.
 */
export function useGroupToggle(statsIds: string[], controlIds: string[]): UseGroupToggle {
  const entities = useEntityStore((s) => s.entities);
  const counts = onOffCounts(statsIds, (id) => entities[id]);

  const active = counts.on > 0;
  const allOn = counts.total > 0 && counts.on === counts.total;
  const allOff = counts.on === 0;
  const majorityOn = counts.total > 0 && counts.on * 2 > counts.total;

  const stateLabel = allOff
    ? "All off"
    : allOn
      ? "All on"
      : `${counts.on} of ${counts.total} on`;

  const toggle = useCallback(async () => {
    // Order matters: allOn implies majorityOn, so it must be checked first.
    const t = HA_DEFAULT_TRANSITION_S;
    if (allOn) {
      await turnOff(controlIds, t);
    } else if (allOff || majorityOn) {
      await turnOn(controlIds, { transition: t });
    } else {
      await turnOff(controlIds, t);
    }
  }, [allOn, allOff, majorityOn, controlIds]);

  return { counts, active, allOn, allOff, stateLabel, toggle };
}
