import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { EntitySections } from "@/components/EntitySections";
import { RoomHeader } from "@/components/RoomHeader";
import { DASHBOARD_THEME } from "@/theme/rooms";
import type { Dashboard } from "@/types/ha";

export function DashboardPage(): JSX.Element {
  const { dashId } = useParams();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!dashId) return;
    setDashboard(null);
    setError(null);
    let cancelled = false;
    fetch(`/api/dashboards/${dashId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return (await r.json()) as Dashboard;
      })
      .then((data) => {
        if (!cancelled) setDashboard(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [dashId]);

  const { accentClass, icon: Icon } = DASHBOARD_THEME;

  return (
    <div className={`${accentClass} mx-auto flex max-w-xl flex-col gap-2 px-5 pb-10 pt-6`}>
      <RoomHeader
        leading={
          <div className="room-title-icon">
            <Icon size={22} strokeWidth={2} />
          </div>
        }
        title={dashboard?.label ?? "\u00A0"}
        subtitle=""
      />

      {error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {dashboard ? <EntitySections sections={dashboard.sections} /> : null}
    </div>
  );
}
