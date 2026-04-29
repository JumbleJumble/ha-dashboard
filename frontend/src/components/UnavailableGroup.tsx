import { ChevronRight } from "lucide-react";
import { CompactEntityRow } from "./CompactEntityRow";

type UnavailableGroupProps = {
  entityIds: string[];
};

export function UnavailableGroup({ entityIds }: UnavailableGroupProps): JSX.Element | null {
  if (entityIds.length === 0) return null;
  return (
    <details className="unavailable-group">
      <summary>
        <ChevronRight className="unavailable-chevron" size={14} strokeWidth={2.5} />
        Unavailable
        <span className="unavailable-count">{entityIds.length}</span>
      </summary>
      <div className="flex flex-col gap-1 pt-2.5">
        {entityIds.map((id) => (
          <CompactEntityRow key={id} entityId={id} />
        ))}
      </div>
    </details>
  );
}
