import { useEntity } from "@/store/entities";
import { formatRelative } from "@/lib/time";
import { getEntityIcon } from "@/theme/entities";

type CompactEntityRowProps = {
  entityId: string;
};

export function CompactEntityRow({ entityId }: CompactEntityRowProps): JSX.Element {
  const entity = useEntity(entityId);
  const Icon = getEntityIcon(entityId, entity?.attributes.friendly_name);
  const name = entity?.attributes.friendly_name ?? entityId;

  return (
    <div className="entity-small">
      <div className="entity-small-icon">
        <Icon size={14} strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink-muted">{name}</div>
      <div className="flex-shrink-0 text-[11px] font-medium tabular-nums text-ink-dim">
        {formatRelative(entity?.last_changed)}
      </div>
    </div>
  );
}
