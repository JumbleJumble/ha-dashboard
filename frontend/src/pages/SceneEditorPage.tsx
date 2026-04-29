import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Lightbulb,
  Palette,
  Plus,
  Sliders,
  Thermometer,
  Ungroup,
  X,
} from "lucide-react";
import { setLightState } from "@/ha/services";
import { HA_DEFAULT_TRANSITION_S } from "@/ha/transitions";
import { useEntityStore } from "@/store/entities";
import type {
  HaEntityState,
  Room,
  Scene,
  SceneGroup,
  SceneState,
} from "@/types/ha";

type EditorGroup = SceneGroup;

type LightCaps = {
  brightness: boolean;
  kelvin: boolean;
  color: boolean;
};

type ControllerTarget = { groupId: string };

const DEFAULT_STATE: SceneState = { brightness: 80, kelvin: 2700 };
const NO_CAPS: LightCaps = { brightness: false, kelvin: false, color: false };
const ALL_CAPS: LightCaps = { brightness: true, kelvin: true, color: true };

const KELVIN_MIN = 2000;
const KELVIN_MAX = 6500;
const KELVIN_STEP = 50;
const LIVE_DEBOUNCE_MS = 300;

export function SceneEditorPage(): JSX.Element {
  const { roomId = "" } = useParams();
  const entities = useEntityStore((s) => s.entities);

  const [room, setRoom] = useState<Room | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [sceneId, setSceneId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [groups, setGroups] = useState<EditorGroup[]>([]);
  const [live, setLive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [selectedLights, setSelectedLights] = useState<Set<string>>(() => new Set());
  const [controllerTarget, setControllerTarget] = useState<ControllerTarget | null>(null);

  const selectionMode = selectedLights.size > 0;

  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    setRoom(null);
    setScenes([]);
    setLoadError(null);
    Promise.all([
      fetch(`/api/rooms/${roomId}`).then(okJson<Room>),
      fetch(`/api/rooms/${roomId}/scenes`).then(okJson<Scene[]>),
    ])
      .then(([r, s]) => {
        if (cancelled) return;
        setRoom(r);
        setScenes(s);
        setGroups((prev) => (prev.length === 0 ? freshGroups(r) : prev));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  const applyAll = useCallback(async () => {
    const flash = (msg: string) => {
      setMessage(msg);
      window.setTimeout(() => setMessage((m) => (m === msg ? null : m)), 1500);
    };
    try {
      for (const g of groups) {
        if (g.lights.length === 0) continue;
        await setLightState(g.lights, g.state, HA_DEFAULT_TRANSITION_S);
      }
      flash("Applied");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Apply failed");
    }
  }, [groups]);

  // Live mode: debounce-apply on any group mutation.
  const liveTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!live) return;
    if (liveTimerRef.current != null) window.clearTimeout(liveTimerRef.current);
    liveTimerRef.current = window.setTimeout(() => {
      liveTimerRef.current = null;
      void applyAll();
    }, LIVE_DEBOUNCE_MS);
    return () => {
      if (liveTimerRef.current != null) {
        window.clearTimeout(liveTimerRef.current);
        liveTimerRef.current = null;
      }
    };
  }, [live, groups, applyAll]);

  const resetToNew = () => {
    if (!room) return;
    setSceneId(null);
    setName("");
    setGroups(freshGroups(room));
    setSelectedLights(new Set());
    setControllerTarget(null);
  };

  const loadScene = (s: Scene) => {
    if (!room) return;
    setSceneId(s.id);
    setName(s.name);
    setGroups(alignToRoom(s.groups, room));
    setSelectedLights(new Set());
    setControllerTarget(null);
  };

  const save = async () => {
    if (!room) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setMessage("Name required");
      return;
    }
    // Scene ids are stable and independent of the name so external references
    // (dashboards, automations) survive renames. Names just need to be unique
    // within the room so the picker isn't ambiguous.
    const id = sceneId ?? makeId();
    const normalised = trimmed.toLowerCase();
    const clash = scenes.find(
      (s) => s.id !== id && s.name.trim().toLowerCase() === normalised,
    );
    if (clash) {
      setMessage(`Another scene in this room is already called "${clash.name}"`);
      return;
    }
    const payload: Scene = {
      id,
      name: trimmed,
      roomId: room.id,
      groups: groups.filter((g) => g.lights.length > 0),
    };
    setSaving(true);
    try {
      const saved = await fetch(`/api/rooms/${room.id}/scenes/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }).then(okJson<Scene>);
      setSceneId(saved.id);
      setName(saved.name);
      setScenes((prev) => {
        const other = prev.filter((s) => s.id !== saved.id);
        return [...other, saved].sort((a, b) => a.name.localeCompare(b.name));
      });
      setMessage("Saved");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  /* ---------- selection / group actions ---------- */

  const toggleSelect = useCallback((lightId: string) => {
    setSelectedLights((prev) => {
      const next = new Set(prev);
      if (next.has(lightId)) next.delete(lightId);
      else next.add(lightId);
      return next;
    });
  }, []);
  const cancelSelection = useCallback(() => {
    setSelectedLights(new Set());
  }, []);

  const createGroupFromSelection = () => {
    if (selectedLights.size < 2) return;
    const ids = Array.from(selectedLights);
    setGroups((prev) => createGroup(prev, ids));
    setSelectedLights(new Set());
  };
  const addSelectionToGroup = (targetId: string) => {
    if (selectedLights.size === 0) return;
    const ids = Array.from(selectedLights);
    setGroups((prev) => addLightsToGroup(prev, ids, targetId));
    setSelectedLights(new Set());
  };
  const removeLightFromGroup = (groupId: string, lightId: string) => {
    setGroups((prev) => removeFromGroup(prev, groupId, lightId));
  };
  const ungroup = (groupId: string) => {
    setGroups((prev) => ungroupGroup(prev, groupId));
  };
  const setGroupState = (groupId: string, state: SceneState) => {
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, state } : g)));
  };

  /* ---------- derived ---------- */

  const { multiGroups, singletons } = useMemo(() => splitGroups(groups), [groups]);

  const capsFor = useCallback(
    (lightIds: string[]): LightCaps =>
      intersectCaps(lightIds.map((l) => lightCaps(entities[l]))),
    [entities],
  );

  const activeTargetGroup = useMemo<EditorGroup | null>(() => {
    if (!controllerTarget) return null;
    return groups.find((g) => g.id === controllerTarget.groupId) ?? null;
  }, [controllerTarget, groups]);

  /* ---------- render ---------- */

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl px-5 pt-6">
        <Header roomLabel={room?.label ?? ""} />
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {loadError}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-5 pb-10 pt-6">
      <Header roomLabel={room?.label ?? ""} />

      <div className="rounded-2xl border border-white/[0.06] bg-ink-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Scene name"
            className="min-w-[10rem] flex-1 rounded-lg bg-black/30 px-3 py-2 text-[15px] outline-none ring-1 ring-white/10 focus:ring-white/30"
          />
          <select
            value={sceneId ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) {
                resetToNew();
                return;
              }
              const s = scenes.find((x) => x.id === v);
              if (s) loadScene(s);
            }}
            className="rounded-lg bg-black/30 px-3 py-2 text-[14px] ring-1 ring-white/10"
          >
            <option value="">— New scene —</option>
            {scenes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <label className="inline-flex items-center gap-2 rounded-lg bg-black/30 px-3 py-2 text-[14px] ring-1 ring-white/10">
            <input
              type="checkbox"
              checked={live}
              onChange={(e) => setLive(e.target.checked)}
            />
            Live
          </label>
          <button
            type="button"
            onClick={applyAll}
            className="rounded-lg bg-white/10 px-3 py-2 text-[14px] font-semibold text-ink-text hover:bg-white/15"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-amber-400/90 px-3 py-2 text-[14px] font-semibold text-black hover:bg-amber-300 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
        {message ? (
          <div className="mt-2 text-[12px] text-ink-muted">{message}</div>
        ) : null}
      </div>

      {selectionMode ? (
        <SelectionBanner
          count={selectedLights.size}
          canCreate={selectedLights.size >= 2}
          onCreate={createGroupFromSelection}
          onCancel={cancelSelection}
        />
      ) : null}

      {multiGroups.map((g, idx) => (
        <GroupCard
          key={g.id}
          group={g}
          index={idx}
          entities={entities}
          caps={capsFor(g.lights)}
          selectionMode={selectionMode}
          selectionCount={selectedLights.size}
          onOpenController={() => setControllerTarget({ groupId: g.id })}
          onAddSelection={() => addSelectionToGroup(g.id)}
          onRemoveLight={(lightId) => removeLightFromGroup(g.id, lightId)}
          onUngroup={() => ungroup(g.id)}
        />
      ))}

      {singletons.length > 0 ? (
        <UngroupedSection
          singletons={singletons}
          entities={entities}
          selectedLights={selectedLights}
          onToggle={toggleSelect}
          onOpenController={(groupId) => setControllerTarget({ groupId })}
        />
      ) : null}

      {activeTargetGroup ? (
        <ControllerModal
          title={controllerTitle(activeTargetGroup, entities)}
          caps={capsFor(activeTargetGroup.lights)}
          state={activeTargetGroup.state}
          onChange={(s) => setGroupState(activeTargetGroup.id, s)}
          onClose={() => setControllerTarget(null)}
        />
      ) : null}
    </div>
  );
}

/* -------------------------- header -------------------------- */

function Header({ roomLabel }: { roomLabel: string }): JSX.Element {
  return (
    <div className="flex items-center gap-3 pt-1">
      <Link
        to="/scenes"
        aria-label="Back"
        className="-ml-2 inline-flex h-10 w-10 items-center justify-center rounded-full text-ink-muted transition hover:text-ink-text active:bg-white/5"
      >
        <ArrowLeft size={22} strokeWidth={2} />
      </Link>
      <h1 className="text-[22px] font-extrabold leading-[1.1] tracking-[-0.02em]">
        Scenes {roomLabel ? <span className="text-ink-muted">· {roomLabel}</span> : null}
      </h1>
    </div>
  );
}

/* ---------------------- selection banner ---------------------- */

function SelectionBanner({
  count,
  canCreate,
  onCreate,
  onCancel,
}: {
  count: number;
  canCreate: boolean;
  onCreate: () => void;
  onCancel: () => void;
}): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/[0.06] px-4 py-3">
      <div className="flex-1 text-[14px] text-ink-text">
        <span className="font-semibold">{count}</span> selected
        <span className="text-ink-muted">
          {" "}
          · tap a group header to add, or create a new one
        </span>
      </div>
      <button
        type="button"
        onClick={onCreate}
        disabled={!canCreate}
        className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400/90 px-3 py-1.5 text-[13px] font-semibold text-black hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
        title={canCreate ? "" : "Select at least 2 lights"}
      >
        <Plus size={14} strokeWidth={2.5} /> New group
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-lg bg-white/5 px-3 py-1.5 text-[13px] text-ink-muted hover:bg-white/10 hover:text-ink-text"
      >
        Cancel
      </button>
    </div>
  );
}

/* ---------------------- group card ---------------------- */

type GroupCardProps = {
  group: EditorGroup;
  index: number;
  entities: Record<string, HaEntityState>;
  caps: LightCaps;
  selectionMode: boolean;
  selectionCount: number;
  onOpenController: () => void;
  onAddSelection: () => void;
  onRemoveLight: (lightId: string) => void;
  onUngroup: () => void;
};

function GroupCard({
  group,
  index,
  entities,
  caps,
  selectionMode,
  selectionCount,
  onOpenController,
  onAddSelection,
  onRemoveLight,
  onUngroup,
}: GroupCardProps): JSX.Element {
  const swatch = stateToCss(group.state);

  const header = selectionMode ? (
    <button
      type="button"
      onClick={onAddSelection}
      className="flex w-full items-center gap-3 rounded-xl border border-dashed border-amber-400/40 bg-amber-400/[0.08] px-3 py-2 text-left transition hover:bg-amber-400/[0.14]"
    >
      <div
        className="h-6 w-6 shrink-0 rounded-full border border-white/20"
        style={{ background: swatch }}
        aria-hidden
      />
      <div className="flex-1 text-[15px] font-semibold text-ink-text">
        Group {index + 1}
        <span className="ml-2 text-[12px] font-normal text-ink-muted">
          {group.lights.length} {group.lights.length === 1 ? "light" : "lights"}
        </span>
      </div>
      <div className="inline-flex items-center gap-1 rounded-lg bg-amber-400/90 px-2.5 py-1 text-[12px] font-semibold text-black">
        <Plus size={14} strokeWidth={2.5} /> Add {selectionCount}
      </div>
    </button>
  ) : (
    <div className="flex items-center gap-2">
      <div
        className="h-6 w-6 shrink-0 rounded-full border border-white/20"
        style={{ background: swatch }}
        aria-hidden
      />
      <div className="flex-1 text-[15px] font-semibold text-ink-text">
        Group {index + 1}
        <span className="ml-2 text-[12px] font-normal text-ink-muted">
          {group.lights.length} lights
        </span>
      </div>
      <button
        type="button"
        onClick={onUngroup}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-ink-muted hover:bg-white/10 hover:text-ink-text"
        aria-label="Ungroup"
        title="Ungroup"
      >
        <Ungroup size={16} strokeWidth={2.5} />
      </button>
      <button
        type="button"
        onClick={onOpenController}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-ink-text hover:bg-white/15"
        aria-label="Edit group"
      >
        <Sliders size={16} strokeWidth={2.5} />
      </button>
    </div>
  );

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-ink-card p-3">
      {header}

      <div className="mt-3 flex flex-col divide-y divide-white/[0.04]">
        {group.lights.map((lightId) => (
          <GroupLightRow
            key={lightId}
            label={shortLabel(lightId, entities[lightId]?.attributes.friendly_name)}
            onRemove={() => onRemoveLight(lightId)}
          />
        ))}
      </div>

      {!caps.brightness && !caps.kelvin && !caps.color ? (
        <div className="mt-3 rounded-lg bg-black/20 px-3 py-2 text-[12px] text-ink-muted">
          Lights in this group share no controllable features.
        </div>
      ) : null}
    </div>
  );
}

function GroupLightRow({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}): JSX.Element {
  return (
    <div className="flex items-center gap-2 px-1 py-1.5">
      <Lightbulb size={14} strokeWidth={2} className="text-ink-muted" />
      <div className="flex-1 text-[13px]">{label}</div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label} from group`}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-white/10 hover:text-ink-text"
      >
        <X size={14} strokeWidth={2.5} />
      </button>
    </div>
  );
}

/* ---------------------- ungrouped section ---------------------- */

function UngroupedSection({
  singletons,
  entities,
  selectedLights,
  onToggle,
  onOpenController,
}: {
  singletons: EditorGroup[];
  entities: Record<string, HaEntityState>;
  selectedLights: Set<string>;
  onToggle: (lightId: string) => void;
  onOpenController: (groupId: string) => void;
}): JSX.Element {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-ink-card p-3">
      <div className="px-1 pb-2 pt-1 text-[12px] font-semibold uppercase tracking-wider text-ink-muted">
        Ungrouped
      </div>
      <div className="flex flex-col divide-y divide-white/[0.04]">
        {singletons.map((g) => {
          const lightId = g.lights[0];
          return (
            <UngroupedRow
              key={g.id}
              label={shortLabel(lightId, entities[lightId]?.attributes.friendly_name)}
              swatch={stateToCss(g.state)}
              selected={selectedLights.has(lightId)}
              onToggle={() => onToggle(lightId)}
              onOpenController={() => onOpenController(g.id)}
            />
          );
        })}
      </div>
    </div>
  );
}

function UngroupedRow({
  label,
  swatch,
  selected,
  onToggle,
  onOpenController,
}: {
  label: string;
  swatch: string;
  selected: boolean;
  onToggle: () => void;
  onOpenController: () => void;
}): JSX.Element {
  const rowStyle: CSSProperties = {
    WebkitUserSelect: "none",
    userSelect: "none",
  };

  return (
    <div
      style={rowStyle}
      onClick={onToggle}
      className={`flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition ${
        selected
          ? "bg-amber-400/[0.14] ring-1 ring-amber-400/40"
          : "hover:bg-white/[0.04]"
      }`}
    >
      <div
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
          selected ? "border-amber-400 bg-amber-400" : "border-white/30"
        }`}
        aria-hidden
      >
        {selected ? (
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="none"
            stroke="black"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 8.5l3 3 7-7" />
          </svg>
        ) : null}
      </div>
      <div
        className="h-5 w-5 shrink-0 rounded-full border border-white/20"
        style={{ background: swatch }}
        aria-hidden
      />
      <div className="flex-1 text-[14px]">{label}</div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenController();
        }}
        aria-label={`Edit ${label}`}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white/10 text-ink-text hover:bg-white/15"
      >
        <Sliders size={14} strokeWidth={2.5} />
      </button>
    </div>
  );
}

/* ---------------------- controller modal ---------------------- */

function ControllerModal({
  title,
  caps,
  state,
  onChange,
  onClose,
}: {
  title: string;
  caps: LightCaps;
  state: SceneState;
  onChange: (s: SceneState) => void;
  onClose: () => void;
}): JSX.Element {
  const showModeToggle = caps.kelvin && caps.color;
  const currentMode: "warm" | "color" =
    state.rgb && caps.color && !(caps.kelvin && state.kelvin != null && !state.rgb)
      ? "color"
      : caps.kelvin
        ? "warm"
        : caps.color
          ? "color"
          : "warm";

  const setMode = (m: "warm" | "color") => {
    if (m === "warm") {
      // Switch to warm: keep brightness, drop rgb, ensure kelvin.
      const next: SceneState = {
        ...state,
        kelvin: state.kelvin ?? DEFAULT_STATE.kelvin,
      };
      delete next.rgb;
      onChange(next);
    } else {
      const next: SceneState = {
        ...state,
        rgb: state.rgb ?? [255, 180, 120],
      };
      delete next.kelvin;
      onChange(next);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/[0.06] bg-ink-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-3">
          <div className="flex-1 text-[15px] font-semibold">{title}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-white/10 hover:text-ink-text"
          >
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>

        {!caps.brightness && !caps.kelvin && !caps.color ? (
          <div className="rounded-lg bg-black/20 px-3 py-2 text-[13px] text-ink-muted">
            No shared controllable features across these lights.
          </div>
        ) : null}

        <div className="flex flex-col gap-3">
          {caps.brightness ? (
            <LabelledSlider
              label="Brightness"
              value={state.brightness ?? DEFAULT_STATE.brightness ?? 80}
              min={0}
              max={100}
              step={1}
              unit="%"
              onChange={(v) => onChange({ ...state, brightness: v })}
            />
          ) : null}

          {showModeToggle ? (
            <div className="flex gap-1 rounded-lg bg-black/30 p-1 ring-1 ring-white/10 w-fit">
              <ModeButton
                active={currentMode === "warm"}
                onClick={() => setMode("warm")}
              >
                <Thermometer size={14} strokeWidth={2.5} /> Warm
              </ModeButton>
              <ModeButton
                active={currentMode === "color"}
                onClick={() => setMode("color")}
              >
                <Palette size={14} strokeWidth={2.5} /> Colour
              </ModeButton>
            </div>
          ) : null}

          {caps.kelvin && currentMode === "warm" ? (
            <LabelledSlider
              label="Warmth"
              value={state.kelvin ?? DEFAULT_STATE.kelvin ?? 2700}
              min={KELVIN_MIN}
              max={KELVIN_MAX}
              step={KELVIN_STEP}
              unit="K"
              onChange={(v) => onChange({ ...state, kelvin: v })}
            />
          ) : null}

          {caps.color && currentMode === "color" ? (
            <div className="flex items-center gap-3">
              <div className="w-24 text-[13px] text-ink-muted">Colour</div>
              <input
                type="color"
                value={rgbToHex(state.rgb ?? [255, 180, 120])}
                onChange={(e) =>
                  onChange({ ...state, rgb: hexToRgb(e.target.value) })
                }
                className="h-10 w-20 cursor-pointer rounded-lg bg-black/20"
              />
              <div className="text-[12px] tabular-nums text-ink-muted">
                {rgbToHex(state.rgb ?? [255, 180, 120])}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-semibold transition ${
        active ? "bg-white/15 text-ink-text" : "text-ink-muted hover:text-ink-text"
      }`}
    >
      {children}
    </button>
  );
}

function LabelledSlider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
}): JSX.Element {
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 text-[13px] text-ink-muted">{label}</div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onInput={(e) => onChange(Number((e.currentTarget as HTMLInputElement).value))}
        onChange={() => {
          /* input handled */
        }}
        className="ha-slider ha-slider--fill flex-1"
        style={
          {
            "--fill": `${((value - min) / (max - min)) * 100}%`,
          } as CSSProperties
        }
      />
      <div className="w-14 text-right text-[12px] tabular-nums text-ink-muted">
        {value}
        {unit}
      </div>
    </div>
  );
}

/* ---------------------- helpers ---------------------- */

async function okJson<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

function freshGroups(room: Room): EditorGroup[] {
  return room.entities.map((id) => ({
    id: makeId(),
    lights: [id],
    state: { ...DEFAULT_STATE },
  }));
}

/** Reconcile a loaded scene with the current room: lights missing from the
 *  room are dropped; lights in the room but missing from the scene are
 *  appended as new solo groups. */
function alignToRoom(loaded: SceneGroup[], room: Room): EditorGroup[] {
  const inRoom = new Set(room.entities);
  const assigned = new Set<string>();
  const groups: EditorGroup[] = [];
  for (const g of loaded) {
    const lights = g.lights.filter((l) => inRoom.has(l) && !assigned.has(l));
    lights.forEach((l) => assigned.add(l));
    if (lights.length > 0) groups.push({ id: g.id || makeId(), lights, state: g.state });
  }
  for (const id of room.entities) {
    if (!assigned.has(id)) {
      groups.push({ id: makeId(), lights: [id], state: { ...DEFAULT_STATE } });
    }
  }
  return groups;
}

function splitGroups(groups: EditorGroup[]): {
  multiGroups: EditorGroup[];
  singletons: EditorGroup[];
} {
  const multiGroups: EditorGroup[] = [];
  const singletons: EditorGroup[] = [];
  for (const g of groups) {
    if (g.lights.length >= 2) multiGroups.push(g);
    else if (g.lights.length === 1) singletons.push(g);
  }
  return { multiGroups, singletons };
}

function createGroup(groups: EditorGroup[], lightIds: string[]): EditorGroup[] {
  if (lightIds.length === 0) return groups;
  const ids = new Set(lightIds);
  // Seed state from the first selected light's singleton.
  const seed = groups.find(
    (g) => g.lights.length === 1 && g.lights[0] === lightIds[0],
  );
  const seedState: SceneState = seed ? { ...seed.state } : { ...DEFAULT_STATE };
  const stripped = groups
    .map((g) => ({ ...g, lights: g.lights.filter((l) => !ids.has(l)) }))
    .filter((g) => g.lights.length > 0);
  return [
    ...stripped,
    { id: makeId(), lights: Array.from(ids), state: seedState },
  ];
}

function addLightsToGroup(
  groups: EditorGroup[],
  lightIds: string[],
  targetId: string,
): EditorGroup[] {
  if (lightIds.length === 0) return groups;
  const ids = new Set(lightIds);
  const target = groups.find((g) => g.id === targetId);
  if (!target) return groups;
  const stripped = groups
    .map((g) => {
      if (g.id === targetId) return g;
      return { ...g, lights: g.lights.filter((l) => !ids.has(l)) };
    })
    .filter((g) => g.id === targetId || g.lights.length > 0);
  return stripped.map((g) =>
    g.id === targetId
      ? { ...g, lights: uniq([...g.lights, ...Array.from(ids)]) }
      : g,
  );
}

function removeFromGroup(
  groups: EditorGroup[],
  groupId: string,
  lightId: string,
): EditorGroup[] {
  const src = groups.find((g) => g.id === groupId);
  if (!src || !src.lights.includes(lightId)) return groups;
  const stripped = groups
    .map((g) =>
      g.id === groupId ? { ...g, lights: g.lights.filter((l) => l !== lightId) } : g,
    )
    .filter((g) => g.lights.length > 0);
  return [
    ...stripped,
    { id: makeId(), lights: [lightId], state: { ...src.state } },
  ];
}

function ungroupGroup(
  groups: EditorGroup[],
  groupId: string,
): EditorGroup[] {
  const src = groups.find((g) => g.id === groupId);
  if (!src) return groups;
  const singletons: EditorGroup[] = src.lights.map((lightId) => ({
    id: makeId(),
    lights: [lightId],
    state: { ...src.state },
  }));
  return [...groups.filter((g) => g.id !== groupId), ...singletons];
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().slice(0, 8);
  }
  return Math.random().toString(36).slice(2, 10);
}

function shortLabel(entityId: string, friendly?: string): string {
  if (friendly) return friendly;
  const tail = entityId.split(".").at(-1) ?? entityId;
  return tail.replace(/_/g, " ");
}

function controllerTitle(
  group: EditorGroup,
  entities: Record<string, HaEntityState>,
): string {
  if (group.lights.length === 1) {
    const id = group.lights[0];
    return shortLabel(id, entities[id]?.attributes.friendly_name);
  }
  return `Group · ${group.lights.length} lights`;
}

/* -- capability inference -- */

// HA light color modes (subset): "onoff", "brightness", "color_temp", "hs",
// "xy", "rgb", "rgbw", "rgbww". We map these to our 3 simple caps.
const COLOR_MODES = new Set(["hs", "xy", "rgb", "rgbw", "rgbww"]);

function lightCaps(entity: HaEntityState | undefined): LightCaps {
  if (!entity) return { ...NO_CAPS };
  const modes = Array.isArray(entity.attributes.supported_color_modes)
    ? entity.attributes.supported_color_modes
    : [];
  const hasColor = modes.some((m) => COLOR_MODES.has(m));
  const hasKelvin = modes.includes("color_temp");
  const hasBrightness =
    hasColor || hasKelvin || modes.includes("brightness");
  return {
    brightness: hasBrightness,
    kelvin: hasKelvin,
    color: hasColor,
  };
}

function intersectCaps(caps: LightCaps[]): LightCaps {
  if (caps.length === 0) return { ...NO_CAPS };
  return caps.reduce<LightCaps>(
    (acc, c) => ({
      brightness: acc.brightness && c.brightness,
      kelvin: acc.kelvin && c.kelvin,
      color: acc.color && c.color,
    }),
    { ...ALL_CAPS },
  );
}

/* -- color helpers -- */

function rgbToHex([r, g, b]: [number, number, number]): string {
  const h = (n: number) => clamp255(n).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return [255, 255, 255];
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function stateToCss(s: SceneState): string {
  if (s.rgb) {
    const [r, g, b] = s.rgb;
    return `rgb(${clamp255(r)}, ${clamp255(g)}, ${clamp255(b)})`;
  }
  if (s.kelvin != null) {
    return kelvinToCss(s.kelvin);
  }
  return "rgba(255,255,255,0.2)";
}

/** Cheap kelvin → rgb preview. Good enough for the swatch dot. */
function kelvinToCss(k: number): string {
  const t = Math.max(0, Math.min(1, (k - 2000) / (6500 - 2000)));
  const r = Math.round(255);
  const g = Math.round(180 + 60 * t);
  const b = Math.round(120 + 135 * t);
  return `rgb(${r}, ${g}, ${b})`;
}
