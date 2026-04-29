import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Thermometer } from "lucide-react";
import { setClimateTemperature } from "@/ha/services";
import { useLiveSlider } from "@/hooks/useLiveSlider";
import { useEntity } from "@/store/entities";

/** Slider range: 15–25 °C in 0.5-degree steps.
 *  Internally we work in half-degree units (× 2) so the slider is an integer
 *  range [30, 50], which keeps useLiveSlider arithmetic clean. */
const TEMP_MIN = 15;
const TEMP_MAX = 25;
const SCALE = 2;
const SLIDER_MIN = TEMP_MIN * SCALE; // 30
const SLIDER_MAX = TEMP_MAX * SCALE; // 50
const SLIDER_DEFAULT = 20 * SCALE;   // 40

/** Blue [59,130,246] → Red [239,68,68] */
const COLD: [number, number, number] = [59, 130, 246];
const HOT: [number, number, number] = [239, 68, 68];

function lerpColor(t: number): string {
  const r = Math.round(COLD[0] + t * (HOT[0] - COLD[0]));
  const g = Math.round(COLD[1] + t * (HOT[1] - COLD[1]));
  const b = Math.round(COLD[2] + t * (HOT[2] - COLD[2]));
  return `rgb(${r},${g},${b})`;
}

const TRACK_GRADIENT = `linear-gradient(to right, rgb(${COLD.join(",")}), rgb(${HOT.join(",")}))`;

type Props = { entityId: string };

export function ClimateWidget({ entityId }: Props): JSX.Element {
  const entity = useEntity(entityId);

  const attrs = entity?.attributes ?? {};
  const state = entity?.state ?? "unavailable";
  const currentTemp =
    typeof attrs.current_temperature === "number" ? attrs.current_temperature : null;
  const targetTemp =
    typeof attrs.temperature === "number" ? attrs.temperature : null;
  const hvacAction =
    typeof attrs.hvac_action === "string" ? attrs.hvac_action : null;

  const isActivelyHeating = hvacAction === "heating";

  // Optimistic override: set immediately on tap, cleared when HA confirms
  // or after a 3s timeout (revert to real HA value).
  const [optimisticTarget, setOptimisticTarget] = useState<number | null>(null);
  const optimisticTimerRef = useRef<number | null>(null);

  const clearOptimistic = () => {
    setOptimisticTarget(null);
    if (optimisticTimerRef.current != null) {
      window.clearTimeout(optimisticTimerRef.current);
      optimisticTimerRef.current = null;
    }
  };

  // When HA confirms the setpoint we optimistically predicted, clear early.
  useEffect(() => {
    if (optimisticTarget == null || targetTemp == null) return;
    if (Math.round(targetTemp * 2) / 2 === optimisticTarget) clearOptimistic();
    // clearOptimistic is stable (only closes over refs/setState)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetTemp, optimisticTarget]);

  useEffect(() => () => { if (optimisticTimerRef.current != null) window.clearTimeout(optimisticTimerRef.current); }, []);

  const externalValue =
    optimisticTarget != null
      ? Math.round(optimisticTarget * SCALE)
      : targetTemp != null
        ? Math.round(targetTemp * SCALE)
        : null;

  // Log only meaningful HA state changes (setpoint or action).
  useEffect(() => {
    console.log("[climate] HA update", JSON.stringify({ targetTemp, currentTemp, hvacAction }));
  }, [targetTemp, currentTemp, hvacAction]);

  // Nest API rate-limits aggressively (~3-5 calls/min for ExecuteDeviceCommand).
  // We fire exactly one call on release, none during drag, and no settle
  // re-assertion — thermostats don't need the same "catch dropped commands"
  // logic as Zigbee bulbs.
  const sendOnce = (v: number) => {
    const temp = v / SCALE;
    console.log("[climate] release →", JSON.stringify({ sliderValue: v, temperature: temp }));
    setClimateTemperature(entityId, temp)
      .then(() => console.log("[climate] OK ←", JSON.stringify({ temperature: temp })))
      .catch((err: unknown) =>
        console.error(
          "[climate] FAILED ←",
          JSON.stringify(err, Object.getOwnPropertyNames(err as object)),
        ),
      );
  };

  const slider = useLiveSlider({
    externalValue,
    fallback: SLIDER_DEFAULT,
    onSend: () => {}, // no drag-intermediate calls — preserve Nest rate limit
    onSettle: sendOnce, // fires once, ~100ms after pointer-up
    throttleMs: 60_000, // effectively infinite — prevents any throttled drag fire
    settleResendMs: 100,
  });

  const displayTarget = (slider.value / SCALE).toFixed(1);

  const handleQuickToggle = () => {
    if (state === "unavailable" || currentTemp == null) return;
    const newTemp = isActivelyHeating
      ? currentTemp - 2
      : Math.max(currentTemp + 2, 21.5);
    const snapped = Math.round(Math.max(TEMP_MIN, Math.min(TEMP_MAX, newTemp)) * 2) / 2;

    // Optimistic: immediately move the display; revert in 3s if HA doesn't confirm.
    setOptimisticTarget(snapped);
    if (optimisticTimerRef.current != null) window.clearTimeout(optimisticTimerRef.current);
    optimisticTimerRef.current = window.setTimeout(clearOptimistic, 3000);

    console.log("[climate] quick toggle →", JSON.stringify({ isActivelyHeating, currentTemp, newTemp: snapped }));
    setClimateTemperature(entityId, snapped)
      .then(() => console.log("[climate] quick toggle OK"))
      .catch((err: unknown) => {
        console.error("[climate] quick toggle FAILED", JSON.stringify(err, Object.getOwnPropertyNames(err as object)));
        clearOptimistic(); // revert immediately on error
      });
  };

  // Compute accent colour at the current slider position for the thumb ring.
  const thumbColor = useMemo(() => {
    const t = (slider.value - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN);
    return lerpColor(Math.max(0, Math.min(1, t)));
  }, [slider.value]);

  return (
    <div
      className={`flex flex-col gap-3 rounded-[18px] border p-4 transition-colors duration-700 ${
        isActivelyHeating
          ? "border-amber-400/25 bg-amber-500/[0.15]"
          : "border-blue-400/10 bg-blue-950/20"
      }`}
    >
      {/* Header row */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleQuickToggle}
          disabled={state === "unavailable" || currentTemp == null}
          aria-label={isActivelyHeating ? "Turn heating down" : "Turn heating up"}
          className={`entity-icon transition-colors duration-700 disabled:opacity-40 ${
            isActivelyHeating
              ? "text-amber-400 hover:text-amber-300 active:scale-95"
              : "text-blue-400/70 hover:text-blue-300 active:scale-95"
          }`}
        >
          <Thermometer size={20} strokeWidth={2} />
        </button>

        {/* Target temperature */}
        <div className="flex-1">
          <div className="text-[22px] font-bold tabular-nums leading-none text-ink-text">
            {displayTarget}°
          </div>
        </div>

        {/* Current temperature */}
        <div className="text-right">
          {currentTemp != null ? (
            <div className="text-[15px] font-semibold tabular-nums text-ink-text">
              Current: {currentTemp.toFixed(1)}°
            </div>
          ) : (
            <div className="text-[15px] font-semibold text-ink-muted">Current: —°</div>
          )}
        </div>
      </div>

      {/* Temperature slider — accent ring follows gradient colour */}
      <div
        className="slider-zone"
        style={{ "--accent": thumbColor } as CSSProperties}
      >
        <div className="ha-gradient-wrap">
          <div className="ha-gradient-track" style={{ backgroundImage: TRACK_GRADIENT }} />
          <input
            type="range"
            min={SLIDER_MIN}
            max={SLIDER_MAX}
            step={1}
            value={slider.value}
            onInput={slider.onInput}
            onPointerDown={slider.onPointerDown}
            onPointerUp={slider.onPointerUp}
            onKeyDown={slider.onKeyDown}
            onKeyUp={slider.onKeyUp}
            onChange={() => {
              /* handled by onInput */
            }}
            className="ha-slider ha-slider--gradient"
            aria-label={`Target temperature ${displayTarget}°C`}
            disabled={state === "unavailable"}
          />
        </div>
      </div>
    </div>
  );
}
