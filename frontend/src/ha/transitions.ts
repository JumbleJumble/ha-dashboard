/** Default Home Assistant `transition` (seconds) for taps, toggles, preset
 *  applies, scene editor live updates, and any other non-slider control.
 *
 *  Sliders use {@link HA_SLIDER_DRAG_TRANSITION_S} /
 *  {@link HA_SLIDER_SETTLE_TRANSITION_S} (gradient + kitchen scene slider), or
 *  `0` for legacy brightness / colour-temp sliders that rely on instant sends. */
export const HA_DEFAULT_TRANSITION_S = 0.1;

/** Throttled drag ticks on multi-channel gradient sliders — long enough that
 *  the next command can retarget mid-ramp. */
export const HA_SLIDER_DRAG_TRANSITION_S = 0.5;

/** Post-release re-assert on gradient sliders — short lock-in. */
export const HA_SLIDER_SETTLE_TRANSITION_S = 0.2;
