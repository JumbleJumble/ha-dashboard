import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Settings } from "lucide-react";
import { RoomTile } from "@/components/RoomTile";
import { useEntityStore } from "@/store/entities";
import { DASHBOARD_THEME } from "@/theme/rooms";
import type { DashboardSummary, Room } from "@/types/ha";

export function HomePage(): JSX.Element {
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [dashboards, setDashboards] = useState<DashboardSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const entities = useEntityStore((s) => s.entities);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/rooms").then((r) => r.json() as Promise<Room[]>),
      fetch("/api/dashboards").then((r) => r.json() as Promise<DashboardSummary[]>),
    ])
      .then(([r, d]) => {
        if (cancelled) return;
        setRooms(r);
        setDashboards(d);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 px-5 pb-10 pt-7">
      <header className="flex items-center justify-between px-1">
        <h1 className="text-[34px] font-extrabold leading-none tracking-[-0.03em]">Home</h1>
        <Link
          to="/scenes"
          aria-label="Scenes"
          className="-mr-2 flex h-10 w-10 items-center justify-center rounded-full text-ink-dim transition hover:bg-white/5 hover:text-ink-text"
        >
          <Settings size={20} strokeWidth={2} />
        </Link>
      </header>

      {error ? <ErrorMessage message={error} /> : null}

      <section className="flex flex-col gap-3.5">
        <SectionHeading>Rooms</SectionHeading>
        {rooms === null ? (
          <Skeleton />
        ) : rooms.length === 0 ? (
          <EmptyHint text="No rooms yet — add some to config/rooms.json." />
        ) : (
          rooms.map((room) => (
            <RoomTile
              key={room.id}
              id={room.id}
              label={room.label}
              subtitle={summariseRoom(room, entities)}
            />
          ))
        )}
      </section>

      {dashboards && dashboards.length > 0 ? (
        <section className="flex flex-col gap-3.5">
          <SectionHeading>Dashboards</SectionHeading>
          {dashboards.map((d) => {
            const { accentClass, icon: Icon } = DASHBOARD_THEME;
            return (
              <Link
                key={d.id}
                to={`/dashboards/${d.id}`}
                className={`room-tile ${accentClass}`}
              >
                <div className="room-tile-icon">
                  <Icon size={24} strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[18px] font-bold tracking-[-0.01em]">{d.label}</div>
                </div>
                <ChevronRight size={20} className="flex-shrink-0 text-ink-dim" />
              </Link>
            );
          })}
        </section>
      ) : null}
    </div>
  );
}

function summariseRoom(room: Room, entities: Record<string, { state: string }>): string {
  const total = room.entities.length;
  if (total === 0) return "empty";

  let on = 0;
  let loaded = 0;
  for (const id of room.entities) {
    const e = entities[id];
    if (!e) continue;
    loaded += 1;
    if (e.state === "on") on += 1;
  }

  const noun = total === 1 ? "light" : "lights";
  if (loaded === 0) return `${total} ${noun}`;
  if (on === 0) return `${total} ${noun} · all off`;
  return `${on} of ${total} on`;
}

function SectionHeading({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <h2 className="mt-1 px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted">
      {children}
    </h2>
  );
}

function Skeleton(): JSX.Element {
  return (
    <div className="flex flex-col gap-3.5">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-[82px] animate-pulse rounded-[22px] border border-white/[0.06] bg-ink-card"
        />
      ))}
    </div>
  );
}

function EmptyHint({ text }: { text: string }): JSX.Element {
  return (
    <div className="rounded-[22px] border border-dashed border-white/10 px-5 py-6 text-center text-sm text-ink-muted">
      {text}
    </div>
  );
}

function ErrorMessage({ message }: { message: string }): JSX.Element {
  return (
    <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
      {message}
    </div>
  );
}
