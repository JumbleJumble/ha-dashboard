import { useState } from "react";
import { Sliders } from "lucide-react";
import { EntityControlModal } from "./EntityControlModal";
import { turnOff, turnOn } from "@/ha/services";
import { useEntity } from "@/store/entities";
import { formatRelative } from "@/lib/time";
import { entityDomain, lightCaps } from "@/lib/capabilities";
import { getEntityIcon } from "@/theme/entities";

type EntityCardProps = {
  entityId: string;
};

export function EntityCard({ entityId }: EntityCardProps): JSX.Element {
  const entity = useEntity(entityId);
  const Icon = getEntityIcon(entityId, entity?.attributes.friendly_name);
  const name = entity?.attributes.friendly_name ?? entityId;
  const [modalOpen, setModalOpen] = useState(false);

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

  const domain = entityDomain(entityId);
  const caps = domain === "light" ? lightCaps(entity) : null;
  const supportsAnyDimming = !!caps && (caps.brightness || caps.kelvin || caps.color);
  const togglable =
    (domain === "light" || domain === "switch") && (state === "on" || state === "off");

  const onCardClick = () => {
    if (!togglable) return;
    if (supportsAnyDimming) {
      setModalOpen(true);
    } else {
      // On/off-only: tap on the button just toggles state.
      if (state === "on") void turnOff([entityId]);
      else void turnOn([entityId]);
    }
  };

  return (
    <>
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
        {togglable ? (
          <button
            type="button"
            onClick={onCardClick}
            aria-label={
              supportsAnyDimming
                ? `Open controls for ${name}`
                : state === "on"
                  ? `Turn off ${name}`
                  : `Turn on ${name}`
            }
            className="entity-action-btn"
          >
            {supportsAnyDimming ? (
              <Sliders size={16} strokeWidth={2.5} />
            ) : (
              <PowerGlyph isOn={state === "on"} />
            )}
          </button>
        ) : null}
      </div>
      {modalOpen ? (
        <EntityControlModal entityId={entityId} onClose={() => setModalOpen(false)} />
      ) : null}
    </>
  );
}

function PowerGlyph({ isOn }: { isOn: boolean }): JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{ opacity: isOn ? 1 : 0.85 }}
    >
      <path d="M12 2v10" />
      <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
    </svg>
  );
}
