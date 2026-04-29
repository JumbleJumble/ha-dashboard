import { useEntityStore } from "@/store/entities";

export function ConnectionStatusBadge(): JSX.Element | null {
  const status = useEntityStore((s) => s.status);

  if (status.kind === "connected") return null;

  const label =
    status.kind === "idle"
      ? "Starting"
      : status.kind === "connecting"
        ? "Connecting to HA…"
        : status.kind === "reconnecting"
          ? "Reconnecting to HA…"
          : `HA error: ${status.message}`;

  const color =
    status.kind === "error"
      ? "bg-red-500/15 text-red-200 ring-red-500/25"
      : "bg-amber-500/15 text-amber-200 ring-amber-500/25";

  return (
    <div
      className={`fixed left-1/2 top-3 z-50 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-semibold shadow-lg ring-1 ${color}`}
      role="status"
    >
      {label}
    </div>
  );
}
