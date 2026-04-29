import { useEntity } from "@/store/entities";
import { formatRelative } from "@/lib/time";
import { getEntityIcon } from "@/theme/entities";

type EntityCardProps = {
  entityId: string;
};

export function EntityCard({ entityId }: EntityCardProps): JSX.Element {
  const entity = useEntity(entityId);
  const Icon = getEntityIcon(entityId, entity?.attributes.friendly_name);
  const name = entity?.attributes.friendly_name ?? entityId;

  const state = entity?.state;
  const stateClass =
    state === "on"
      ? "state-on"
      : state === "off"
        ? "state-off"
        : state === "unavailable" || state === "unknown" || state === undefined
          ? "state-unavailable"
          : "state-off";

  const pill =
    state === "on"
      ? "On"
      : state === "off"
        ? "Off"
        : state === "unavailable"
          ? "Offline"
          : state === "unknown"
            ? "Unknown"
            : (state ?? "—");

  const sub = entity
    ? state === "on" || state === "off"
      ? `updated ${formatRelative(entity.last_changed)}`
      : `last seen ${formatRelative(entity.last_changed)}`
    : "not loaded";

  return (
    <div className={`entity ${stateClass}`}>
      <div className="entity-icon">
        <Icon size={20} strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold tracking-[-0.005em] text-ink-text">
          {name}
        </div>
        <div className="mt-0.5 truncate text-[12px] font-medium text-ink-muted">{sub}</div>
      </div>
      <div className="state-pill">{pill}</div>
    </div>
  );
}
