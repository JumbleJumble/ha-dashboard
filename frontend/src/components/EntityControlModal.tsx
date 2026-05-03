import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { Palette, Power, Thermometer, X } from "lucide-react";
import {
  setBrightnessPct,
  setColorTempKelvin,
  setLightState,
  turnOff,
  turnOn,
} from "@/ha/services";
import { useLiveSlider } from "@/hooks/useLiveSlider";
import { lightCaps, type LightCaps } from "@/lib/capabilities";
import { useEntity } from "@/store/entities";
import type { HaEntityState } from "@/types/ha";

type EntityControlModalProps = {
  entityId: string;
  onClose: () => void;
};

const KELVIN_MIN = 2000;
const KELVIN_MAX = 6500;
const KELVIN_STEP = 50;

const snapK = (v: number): number => {
  const snapped = Math.round((v - KELVIN_MIN) / KELVIN_STEP) * KELVIN_STEP + KELVIN_MIN;
  return Math.max(KELVIN_MIN, Math.min(KELVIN_MAX, snapped));
};

export function EntityControlModal({ entityId, onClose }: EntityControlModalProps): JSX.Element {
  const entity = useEntity(entityId);
  const caps = lightCaps(entity);
  const isOn = entity?.state === "on";
  const name = entity?.attributes.friendly_name ?? entityId;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-3 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/[0.06] bg-ink-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold text-ink-text">{name}</div>
            <div className="mt-0.5 text-[12px] text-ink-muted">
              {entity ? (isOn ? "On" : entity.state === "off" ? "Off" : entity.state) : "—"}
            </div>
          </div>
          <PowerToggle entityId={entityId} isOn={!!isOn} />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-white/10 hover:text-ink-text"
          >
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>

        <ControlsBody entity={entity} entityId={entityId} caps={caps} />
      </div>
    </div>
  );
}

/* -------------------------- power toggle pill -------------------------- */

function PowerToggle({ entityId, isOn }: { entityId: string; isOn: boolean }): JSX.Element {
  const onClick = useCallback(() => {
    if (isOn) void turnOff([entityId]);
    else void turnOn([entityId]);
  }, [entityId, isOn]);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isOn}
      aria-label={isOn ? "Turn off" : "Turn on"}
      className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition ${
        isOn
          ? "bg-amber-300/90 text-black hover:bg-amber-200"
          : "bg-white/10 text-ink-text hover:bg-white/15"
      }`}
    >
      <Power size={14} strokeWidth={2.5} />
      {isOn ? "On" : "Off"}
    </button>
  );
}

/* -------------------------- controls body -------------------------- */

function ControlsBody({
  entity,
  entityId,
  caps,
}: {
  entity: HaEntityState | undefined;
  entityId: string;
  caps: LightCaps;
}): JSX.Element {
  if (!entity) {
    return (
      <div className="rounded-lg bg-black/20 px-3 py-2 text-[13px] text-ink-muted">
        Entity state not loaded yet.
      </div>
    );
  }

  if (!caps.brightness && !caps.kelvin && !caps.color) {
    return (
      <div className="rounded-lg bg-black/20 px-3 py-2 text-[13px] text-ink-muted">
        This device only supports on/off.
      </div>
    );
  }

  // Decide which mode panel to show. Prefer "color" if the light is currently
  // showing rgb/hs (and supports it), otherwise fall back to "warm" if kelvin
  // is supported, otherwise "color".
  const colorMode = entity.attributes.color_mode as string | undefined;
  const initialMode: "warm" | "color" =
    caps.kelvin && caps.color
      ? colorMode === "color_temp"
        ? "warm"
        : isColorMode(colorMode)
          ? "color"
          : "warm"
      : caps.kelvin
        ? "warm"
        : "color";

  return (
    <div className="flex flex-col gap-4">
      {caps.brightness ? <BrightnessRow entity={entity} entityId={entityId} /> : null}

      {caps.kelvin && caps.color ? (
        <ModeAwareCT entity={entity} entityId={entityId} initialMode={initialMode} />
      ) : caps.kelvin ? (
        <KelvinRow entity={entity} entityId={entityId} />
      ) : caps.color ? (
        <ColorRow entity={entity} entityId={entityId} />
      ) : null}
    </div>
  );
}

/* -------------------------- brightness slider -------------------------- */

function BrightnessRow({
  entity,
  entityId,
}: {
  entity: HaEntityState;
  entityId: string;
}): JSX.Element {
  const brightnessAttr = typeof entity.attributes.brightness === "number"
    ? Math.round((entity.attributes.brightness / 255) * 100)
    : null;
  const external = entity.state === "on" ? brightnessAttr : null;

  const slider = useLiveSlider({
    externalValue: external,
    fallback: 60,
    onSend: (v) => {
      void setBrightnessPct([entityId], v);
    },
  });

  return (
    <SliderRow
      label="Brightness"
      readout={external == null ? "—" : `${slider.value}%`}
      slider={slider}
      min={0}
      max={100}
      step={1}
      sliderClass="ha-slider ha-slider--fill"
      sliderStyle={{ "--fill": `${slider.value}%` } as CSSProperties}
      ariaLabel="Brightness"
    />
  );
}

/* -------------------------- kelvin slider -------------------------- */

function KelvinRow({
  entity,
  entityId,
}: {
  entity: HaEntityState;
  entityId: string;
}): JSX.Element {
  const ext = typeof entity.attributes.color_temp_kelvin === "number"
    ? entity.attributes.color_temp_kelvin
    : null;
  const external = entity.state === "on" ? ext : null;

  const slider = useLiveSlider({
    externalValue: external,
    fallback: 3200,
    snap: snapK,
    onSend: (v) => {
      void setColorTempKelvin([entityId], v);
    },
  });

  return (
    <SliderRow
      label="Warmth"
      readout={external == null ? "—" : `${slider.value}K`}
      slider={slider}
      min={KELVIN_MIN}
      max={KELVIN_MAX}
      step={KELVIN_STEP}
      sliderClass="ha-slider ha-slider--ct"
      ariaLabel="Colour temperature"
    />
  );
}

/* -------------------------- mode-aware CT/color -------------------------- */

function ModeAwareCT({
  entity,
  entityId,
  initialMode,
}: {
  entity: HaEntityState;
  entityId: string;
  initialMode: "warm" | "color";
}): JSX.Element {
  const [mode, setMode] = useState<"warm" | "color">(initialMode);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1 rounded-lg bg-black/30 p-1 ring-1 ring-white/10 w-fit">
        <ModeButton active={mode === "warm"} onClick={() => setMode("warm")}>
          <Thermometer size={14} strokeWidth={2.5} /> Warm
        </ModeButton>
        <ModeButton active={mode === "color"} onClick={() => setMode("color")}>
          <Palette size={14} strokeWidth={2.5} /> Colour
        </ModeButton>
      </div>
      {mode === "warm" ? (
        <KelvinRow entity={entity} entityId={entityId} />
      ) : (
        <ColorRow entity={entity} entityId={entityId} />
      )}
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
  children: React.ReactNode;
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

/* -------------------------- color picker -------------------------- */

function ColorRow({
  entity,
  entityId,
}: {
  entity: HaEntityState;
  entityId: string;
}): JSX.Element {
  const rgb = readRgb(entity) ?? [255, 180, 120];
  const hex = rgbToHex(rgb);

  const onChange = (next: string) => {
    const v = hexToRgb(next);
    void setLightState([entityId], { rgb: v });
  };

  return (
    <div className="flex items-center gap-3">
      <div className="w-24 text-[13px] text-ink-muted">Colour</div>
      <input
        type="color"
        value={hex}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-20 cursor-pointer rounded-lg bg-black/20"
      />
      <div className="text-[12px] tabular-nums text-ink-muted">{hex}</div>
    </div>
  );
}

/* -------------------------- shared slider row -------------------------- */

type SliderControl = {
  value: number;
  onInput: (e: React.FormEvent<HTMLInputElement>) => void;
  onPointerDown: (e: React.PointerEvent<HTMLInputElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLInputElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onKeyUp: (e: React.KeyboardEvent<HTMLInputElement>) => void;
};

function SliderRow({
  label,
  readout,
  slider,
  min,
  max,
  step,
  sliderClass,
  sliderStyle,
  ariaLabel,
}: {
  label: string;
  readout: string;
  slider: SliderControl;
  min: number;
  max: number;
  step: number;
  sliderClass: string;
  sliderStyle?: CSSProperties;
  ariaLabel: string;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-medium text-ink-muted">{label}</div>
        <div className="text-[14px] font-semibold tabular-nums text-ink-text">{readout}</div>
      </div>
      <div className="slider-zone">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={slider.value}
          onInput={slider.onInput}
          onPointerDown={slider.onPointerDown}
          onPointerUp={slider.onPointerUp}
          onKeyDown={slider.onKeyDown}
          onKeyUp={slider.onKeyUp}
          onChange={() => {
            /* handled by onInput */
          }}
          className={sliderClass}
          style={sliderStyle}
          aria-label={ariaLabel}
        />
      </div>
    </div>
  );
}

/* -------------------------- helpers -------------------------- */

function isColorMode(mode: string | undefined): boolean {
  if (!mode) return false;
  return ["hs", "xy", "rgb", "rgbw", "rgbww"].includes(mode);
}

function readRgb(entity: HaEntityState): [number, number, number] | null {
  const rgb = entity.attributes.rgb_color;
  if (Array.isArray(rgb) && rgb.length === 3 && rgb.every((v) => typeof v === "number")) {
    return [rgb[0] as number, rgb[1] as number, rgb[2] as number];
  }
  return null;
}

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
