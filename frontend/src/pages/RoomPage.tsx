import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { Settings } from "lucide-react";
import { EntitySections } from "@/components/EntitySections";
import { RoomHeader } from "@/components/RoomHeader";
import { RoomHeaderToggle } from "@/components/RoomHeaderToggle";
import { ClimateWidget } from "@/components/widgets/ClimateWidget";
import { GroupBrightness } from "@/components/widgets/GroupBrightness";
import { GroupColorTemp } from "@/components/widgets/GroupColorTemp";
import { GroupGradient } from "@/components/widgets/GroupGradient";
import { GroupToggle } from "@/components/widgets/GroupToggle";
import { useRoomAccent } from "@/hooks/useRoomAccent";
import { useEntityStore } from "@/store/entities";
import { getRoomTheme } from "@/theme/rooms";
import type { Room, RoomWidget } from "@/types/ha";

type RoomPageProps = {
  /** When true, render the room's diagnostics view instead of the dashboard. */
  diagnostics?: boolean;
};

export function RoomPage({ diagnostics = false }: RoomPageProps): JSX.Element {
  const { roomId = "" } = useParams();
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roomId) return;
    setRoom(null);
    setError(null);
    let cancelled = false;
    fetch(`/api/rooms/${roomId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return (await r.json()) as Room;
      })
      .then((data) => {
        if (!cancelled) setRoom(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  const theme = getRoomTheme(roomId);
  const ThemedIcon = theme.icon;
  const hasDashboard = (room?.dashboard?.pages.length ?? 0) > 0;
  const dynamicAccent = useRoomAccent(hasDashboard ? (room?.entities ?? []) : []);
  const subtitle = useRoomSubtitle(room);

  // Diagnostics is its own view. If the room has no dashboard at all, /room/:id
  // falls through to diagnostics too.
  const showingDiagnostics = diagnostics || !hasDashboard;

  const backTo = showingDiagnostics && hasDashboard ? `/room/${roomId}` : "/";
  const trailing =
    !showingDiagnostics && hasDashboard ? (
      <Link
        to={`/room/${roomId}/diagnostics`}
        aria-label="Diagnostics"
        className="-mr-1 inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-muted/60 transition hover:text-ink-text active:bg-white/5"
      >
        <Settings size={18} strokeWidth={2} />
      </Link>
    ) : null;

  // On a dashboard room the themed icon slot becomes a compact all-lights
  // toggle. On a dashboard-less room (diagnostics-only) we keep the static
  // themed icon — there's no well-defined "group" to toggle.
  const leading =
    !showingDiagnostics && hasDashboard && room ? (
      <RoomHeaderToggle
        statsIds={room.entities}
        controlIds={room.dashboard?.group ? [room.dashboard.group] : room.entities}
      />
    ) : (
      <div className="room-title-icon">
        <ThemedIcon size={22} strokeWidth={2} />
      </div>
    );

  return (
    <div
      className={`${theme.accentClass} mx-auto flex max-w-xl flex-col px-5 pb-10 pt-6`}
      style={(dynamicAccent as React.CSSProperties | undefined) ?? undefined}
    >
      <RoomHeader
        leading={leading}
        title={room?.label ?? "\u00A0"}
        subtitle={subtitle}
        backTo={backTo}
        trailing={trailing}
      />

      {error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      {showingDiagnostics ? (
        <EntitySections sections={[{ entities: room?.entities ?? [] }]} />
      ) : (
        <DashboardPager room={room!} />
      )}
    </div>
  );
}

/** Horizontally paged dashboard. Dashboards are guaranteed non-empty here. */
function DashboardPager({ room }: { room: Room }): JSX.Element {
  const { pathname } = useLocation();
  const pages = room.dashboard?.pages ?? [];
  const pagerRef = useRef<HTMLDivElement>(null);
  const didInitialScrollRef = useRef(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  useLayoutEffect(() => {
    if (didInitialScrollRef.current) return;
    if (!pagerRef.current) return;
    const el = pagerRef.current;
    const idx = readIndexFromUrl(pages.length);
    const width = el.clientWidth;
    if (width === 0) return;
    const prevBehaviour = el.style.scrollBehavior;
    el.style.scrollBehavior = "auto";
    el.scrollLeft = idx * width;
    el.style.scrollBehavior = prevBehaviour;
    setCurrentIndex(idx);
    didInitialScrollRef.current = true;
  }, [pages.length]);

  useEffect(() => {
    const el = pagerRef.current;
    if (!el) return;
    let t: number | null = null;
    const onScroll = () => {
      if (!didInitialScrollRef.current) return;
      if (t != null) window.clearTimeout(t);
      t = window.setTimeout(() => {
        t = null;
        const w = el.clientWidth;
        if (w === 0) return;
        const idx = Math.max(0, Math.min(pages.length - 1, Math.round(el.scrollLeft / w)));
        setCurrentIndex((prev) => (prev !== idx ? idx : prev));
        writeIndexToUrl(idx);
      }, 120);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (t != null) window.clearTimeout(t);
    };
  }, [pages.length, pathname]);

  const controlIds = room.dashboard?.group ? [room.dashboard.group] : room.entities;

  return (
    <>
      {pages.length > 1 ? (
        <div className="room-dots">
          {pages.map((_, i) => (
            <div
              key={i}
              className={`room-dot ${i === currentIndex ? "is-active" : ""}`}
              aria-hidden
            />
          ))}
        </div>
      ) : null}

      <div className="room-pager mt-2" ref={pagerRef}>
        {pages.map((page, i) => (
          <div className="room-page px-0.5" key={i}>
            <WidgetsRenderer
              widgets={page.widgets}
              statsIds={room.entities}
              controlIds={controlIds}
            />
          </div>
        ))}
      </div>
    </>
  );
}

function WidgetsRenderer({
  widgets,
  statsIds,
  controlIds,
}: {
  widgets: RoomWidget[];
  statsIds: string[];
  controlIds: string[];
}): JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      {widgets.map((w, i) => {
        switch (w.type) {
          case "group-toggle":
            return <GroupToggle key={i} statsIds={statsIds} controlIds={controlIds} />;
          case "group-brightness":
            return <GroupBrightness key={i} statsIds={statsIds} controlIds={controlIds} />;
          case "group-color-temp":
            return <GroupColorTemp key={i} statsIds={statsIds} controlIds={controlIds} />;
          case "gradient":
            return (
              <GroupGradient
                key={i}
                label={w.label}
                channels={w.channels}
                displayChannels={w.displayChannels}
                statsIds={statsIds}
                controlIds={controlIds}
              />
            );
          case "climate":
            return <ClimateWidget key={i} entityId={w.entityId} />;
          default:
            return null;
        }
      })}
    </div>
  );
}

function useRoomSubtitle(room: Room | null): string {
  const entities = useEntityStore((s) => s.entities);
  if (!room) return " ";
  let on = 0;
  let total = 0;
  let loaded = 0;
  for (const id of room.entities) {
    total += 1;
    const e = entities[id];
    if (!e) continue;
    loaded += 1;
    if (e.state === "on") on += 1;
  }
  const noun = total === 1 ? "entity" : "entities";
  if (loaded === 0) return `${total} ${noun}`;
  if (on === 0) return "all off";
  return `${on} of ${total} on`;
}

function readIndexFromUrl(pageCount: number): number {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("page");
  if (raw == null) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  const zeroIdx = Math.round(n) - 1;
  if (zeroIdx < 0) return 0;
  if (zeroIdx >= pageCount) return pageCount > 0 ? pageCount - 1 : 0;
  return zeroIdx;
}

function writeIndexToUrl(idx: number): void {
  const url = new URL(window.location.href);
  if (idx === 0) {
    url.searchParams.delete("page");
  } else {
    url.searchParams.set("page", String(idx + 1));
  }
  window.history.replaceState(null, "", url.toString());
}
