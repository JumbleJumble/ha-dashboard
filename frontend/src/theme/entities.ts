import {
  Blinds,
  Fan,
  HelpCircle,
  LampCeiling,
  LampDesk,
  Lightbulb,
  Lock,
  Plug,
  Speaker,
  Thermometer,
  ToggleLeft,
  Tv,
  type LucideIcon,
} from "lucide-react";

/**
 * Pick a Lucide icon for an entity based on its domain and name hints.
 * Keep heuristics conservative — when unsure, fall back to the domain default.
 */
export function getEntityIcon(entityId: string, friendlyName?: string): LucideIcon {
  const [domain, rest = ""] = entityId.split(".", 2);
  const haystack = `${rest} ${friendlyName ?? ""}`.toLowerCase();

  if (domain === "light") {
    if (/\bceiling\b|\bhob\b|\bgap\b|\bsink\b|\btable\b|\bbar\b/.test(haystack)) return LampCeiling;
    if (/\blamp\b|\barmchair\b|\bdesk\b|\bdoor\b|\bwardrobe\b|\bfern\b|\bwindow\b/.test(haystack))
      return LampDesk;
    return Lightbulb;
  }
  if (domain === "switch") return ToggleLeft;
  if (domain === "fan") return Fan;
  if (domain === "cover") return Blinds;
  if (domain === "lock") return Lock;
  if (domain === "media_player") {
    if (/\btv\b|\btele\b/.test(haystack)) return Tv;
    return Speaker;
  }
  if (domain === "sensor" || domain === "binary_sensor") return Thermometer;
  if (domain === "climate") return Thermometer;
  if (domain === "input_boolean") return ToggleLeft;
  if (domain === "scene" || domain === "script") return Plug;
  return HelpCircle;
}
