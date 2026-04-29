import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { getRoomTheme } from "@/theme/rooms";

type RoomTileProps = {
  id: string;
  label: string;
  subtitle: string;
};

export function RoomTile({ id, label, subtitle }: RoomTileProps): JSX.Element {
  const { accentClass, icon: Icon } = getRoomTheme(id);
  return (
    <Link to={`/room/${id}`} className={`room-tile ${accentClass}`}>
      <div className="room-tile-icon">
        <Icon size={24} strokeWidth={2} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[18px] font-bold tracking-[-0.01em]">{label}</div>
        <div className="mt-0.5 text-[13px] font-medium text-ink-muted">{subtitle}</div>
      </div>
      <ChevronRight size={20} className="flex-shrink-0 text-ink-dim" />
    </Link>
  );
}
