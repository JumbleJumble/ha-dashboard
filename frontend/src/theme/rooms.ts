import {
  Baby,
  Bed,
  ChefHat,
  DoorOpen,
  Home,
  LayoutGrid,
  Monitor,
  Sofa,
  type LucideIcon,
} from "lucide-react";

export type RoomTheme = {
  accentClass: string;
  icon: LucideIcon;
};

const ROOM_THEMES: Record<string, RoomTheme> = {
  lounge: { accentClass: "accent-lounge", icon: Sofa },
  kitchen: { accentClass: "accent-kitchen", icon: ChefHat },
  master_bedroom: { accentClass: "accent-master_bedroom", icon: Bed },
  kara: { accentClass: "accent-kara", icon: Baby },
  sonny: { accentClass: "accent-sonny", icon: Baby },
  office: { accentClass: "accent-office", icon: Monitor },
  hall: { accentClass: "accent-hall", icon: DoorOpen },
};

const DEFAULT_THEME: RoomTheme = {
  accentClass: "accent-lounge",
  icon: Home,
};

export function getRoomTheme(roomId: string): RoomTheme {
  return ROOM_THEMES[roomId] ?? DEFAULT_THEME;
}

export const DASHBOARD_THEME: RoomTheme = {
  accentClass: "accent-lounge",
  icon: LayoutGrid,
};
