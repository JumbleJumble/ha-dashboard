import { EntityCard } from "./EntityCard";
import { UnavailableGroup } from "./UnavailableGroup";
import { useEntityStore } from "@/store/entities";
import type { HaEntityState } from "@/types/ha";

type Section = {
  label?: string;
  entities: string[];
};

type EntitySectionsProps = {
  sections: Section[];
};

export function EntitySections({ sections }: EntitySectionsProps): JSX.Element {
  const entities = useEntityStore((s) => s.entities);
  const { partitioned, unavailable } = partition(sections, entities);

  return (
    <>
      {partitioned.map((section, idx) => (
        <section key={idx} className="flex flex-col gap-2.5">
          {section.label ? (
            <h2 className="mt-3 px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted">
              {section.label}
            </h2>
          ) : null}
          {section.entities.length === 0 ? (
            <div className="rounded-[18px] border border-dashed border-white/10 px-5 py-6 text-center text-sm text-ink-muted">
              No available entities.
            </div>
          ) : (
            section.entities.map((entityId) => <EntityCard key={entityId} entityId={entityId} />)
          )}
        </section>
      ))}
      <UnavailableGroup entityIds={unavailable} />
    </>
  );
}

function partition(sections: Section[], entities: Record<string, HaEntityState>) {
  const unavailable: string[] = [];
  const partitioned = sections.map((section) => {
    const available: string[] = [];
    for (const id of section.entities) {
      const e = entities[id];
      if (e && (e.state === "unavailable" || e.state === "unknown")) {
        unavailable.push(id);
      } else {
        available.push(id);
      }
    }
    return { label: section.label, entities: available };
  });
  return { partitioned, unavailable };
}
