import { useMemo } from "react";
import { accentVarsFromRgb, type AccentVars } from "@/lib/color";
import { averageOnLightRgb } from "@/lib/lights";
import { useEntityStore } from "@/store/entities";

/**
 * Derive CSS accent variables from the live average colour of on-lights in
 * the given entity list. Returns null when no lights are on — callers should
 * leave the static .accent-* class as the fallback.
 */
export function useRoomAccent(entityIds: string[]): AccentVars | null {
  const entities = useEntityStore((s) => s.entities);
  return useMemo(() => {
    const rgb = averageOnLightRgb(entityIds, (id) => entities[id]);
    return rgb ? accentVarsFromRgb(rgb) : null;
  }, [entities, entityIds]);
}
