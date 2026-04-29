import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { getRoomTheme } from "@/theme/rooms";
import type { Room } from "@/types/ha";

/**
 * Unlinked landing for the scene creator. Pick a room, then navigate to
 * the editor. Not reachable from the main app — visit /scenes directly.
 */
export function ScenePickerPage(): JSX.Element {
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/rooms")
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
        return (await r.json()) as Room[];
      })
      .then((r) => {
        if (!cancelled) setRooms(r);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 px-5 pb-10 pt-6">
      <div className="flex items-center gap-3 pt-1 pb-3">
        <Link
          to="/"
          aria-label="Back"
          className="-ml-2 inline-flex h-10 w-10 items-center justify-center rounded-full text-ink-muted transition hover:text-ink-text active:bg-white/5"
        >
          <ArrowLeft size={22} strokeWidth={2} />
        </Link>
        <h1 className="text-[22px] font-extrabold leading-[1.1] tracking-[-0.02em]">
          Scene creator
        </h1>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        {(rooms ?? []).map((room) => {
          const theme = getRoomTheme(room.id);
          const Icon = theme.icon;
          return (
            <Link
              key={room.id}
              to={`/scenes/${room.id}`}
              className={`${theme.accentClass} flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-ink-card px-4 py-3 transition hover:bg-white/[0.04]`}
            >
              <div className="room-title-icon" style={{ width: 36, height: 36 }}>
                <Icon size={18} strokeWidth={2} />
              </div>
              <div className="flex-1 text-[15px] font-semibold text-ink-text">
                {room.label}
              </div>
              <div className="text-[12px] text-ink-muted">
                {room.entities.length}{" "}
                {room.entities.length === 1 ? "entity" : "entities"}
              </div>
              <ChevronRight size={18} className="text-ink-muted" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
