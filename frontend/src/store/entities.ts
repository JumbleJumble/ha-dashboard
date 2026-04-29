import { create } from "zustand";
import type { HaConnectionStatus, HaEntityState } from "@/types/ha";

type EntityMap = Record<string, HaEntityState>;

type EntityStore = {
  entities: EntityMap;
  status: HaConnectionStatus;
  hydrate: (list: HaEntityState[]) => void;
  upsert: (entity: HaEntityState) => void;
  remove: (entityId: string) => void;
  setStatus: (status: HaConnectionStatus) => void;
};

export const useEntityStore = create<EntityStore>((set) => ({
  entities: {},
  status: { kind: "idle" },
  hydrate: (list) =>
    set(() => ({
      entities: Object.fromEntries(list.map((e) => [e.entity_id, e])),
    })),
  upsert: (entity) =>
    set((state) => ({
      entities: { ...state.entities, [entity.entity_id]: entity },
    })),
  remove: (entityId) =>
    set((state) => {
      if (!(entityId in state.entities)) return state;
      const next = { ...state.entities };
      delete next[entityId];
      return { entities: next };
    }),
  setStatus: (status) => set(() => ({ status })),
}));

export function useEntity(entityId: string): HaEntityState | undefined {
  return useEntityStore((s) => s.entities[entityId]);
}

export function useEntities(entityIds: string[]): (HaEntityState | undefined)[] {
  return useEntityStore((s) => entityIds.map((id) => s.entities[id]));
}
