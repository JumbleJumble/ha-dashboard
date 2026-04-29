import { useCallback, useEffect, useRef, useState } from "react";

type Options = {
  /** Current "true" value from HA. Null when unknown/uninitialised
   *  (e.g. all lights off). */
  externalValue: number | null;
  /** Used while interacting if externalValue is null. */
  fallback: number;
  /** Throttled drag-tick callback. Fires at most once every `throttleMs`
   *  while dragging, and once on release. */
  onSend: (value: number) => void;
  /** Optional post-release re-assert. Fires `settleResendMs` after release
   *  with the final committed value. Defaults to `onSend`. Use this to send
   *  a final command with a different transition, or to bypass mid-drag
   *  optimisations (e.g. diff-sending) that might otherwise swallow it. */
  onSettle?: (value: number) => void;
  /** Max drag-tick rate. Also roughly sets the upper bound on ZCL
   *  multicasts/sec we produce for Zigbee groups. Defaults to 300ms to
   *  stay inside Hue bulb firmware rate limits (~5 commands/sec/bulb). */
  throttleMs?: number;
  /** After release, wait this long then fire `onSettle`. Catches commands
   *  dropped by rate-limited devices during rapid drags. 0 disables. */
  settleResendMs?: number;
  /** Optional grid-snap applied to external values before they drive the UI.
   *  Example: CT rounds to nearest 50K to hide mired round-trip drift. */
  snap?: (v: number) => number;
};

type Result = {
  value: number;
  onInput: (e: React.FormEvent<HTMLInputElement>) => void;
  onPointerDown: (e: React.PointerEvent<HTMLInputElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLInputElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onKeyUp: (e: React.KeyboardEvent<HTMLInputElement>) => void;
};

/**
 * Controlled slider behaviour shared by every slider widget:
 *
 *  - **Throttled live send**: drag fires `onSend` at up to `throttleMs`.
 *  - **Ownership**: once the user touches the slider, external updates are
 *    ignored. The slider stays on the user's target even if bulbs report
 *    back slightly different values (caps, staggered settling, mired
 *    round-trip drift, etc). Ownership is released when `externalValue`
 *    transitions from non-null to null (a clean "something else happened"
 *    signal — e.g. lights turned off), or on unmount.
 *  - **Post-release settle**: `settleResendMs` after release, `onSettle`
 *    (defaulting to `onSend`) is fired again with the committed value, to
 *    catch up commands that rate-limited devices may have dropped during
 *    the drag tail.
 *
 * All the behaviour tuning (throttle, settle delay, transition lengths used
 * inside `onSend`/`onSettle`) should live in this file, `@/ha/transitions`
 * (gradient drag/settle seconds), or `@/ha/services` so sliders stay in
 * lockstep.
 */
export function useLiveSlider({
  externalValue,
  fallback,
  onSend,
  onSettle,
  throttleMs = 300,
  settleResendMs = 700,
  snap,
}: Options): Result {
  const snapRef = useRef(snap);
  useEffect(() => {
    snapRef.current = snap;
  }, [snap]);
  const applySnap = (v: number): number => (snapRef.current ? snapRef.current(v) : v);

  const [local, setLocal] = useState<number>(
    externalValue != null ? applySnap(externalValue) : fallback,
  );

  const ownedRef = useRef(false);
  const prevExternalRef = useRef<number | null>(externalValue);

  const lastSendRef = useRef(0);
  const pendingRef = useRef<number | null>(null);
  const throttleTimerRef = useRef<number | null>(null);
  const settleTimerRef = useRef<number | null>(null);

  const onSendRef = useRef(onSend);
  const onSettleRef = useRef(onSettle);
  useEffect(() => {
    onSendRef.current = onSend;
  }, [onSend]);
  useEffect(() => {
    onSettleRef.current = onSettle;
  }, [onSettle]);

  const cancelThrottle = () => {
    if (throttleTimerRef.current != null) {
      window.clearTimeout(throttleTimerRef.current);
      throttleTimerRef.current = null;
    }
  };
  const cancelSettle = () => {
    if (settleTimerRef.current != null) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
  };

  useEffect(() => {
    const was = prevExternalRef.current;
    prevExternalRef.current = externalValue;
    if (was != null && externalValue == null) ownedRef.current = false;
    if (ownedRef.current) return;
    if (externalValue != null) setLocal(applySnap(externalValue));
    // applySnap is intentionally omitted: it reads through a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalValue]);

  const flushPending = useCallback(() => {
    throttleTimerRef.current = null;
    const v = pendingRef.current;
    if (v == null) return;
    pendingRef.current = null;
    lastSendRef.current = Date.now();
    onSendRef.current(v);
  }, []);

  const send = useCallback(
    (v: number) => {
      const now = Date.now();
      const since = now - lastSendRef.current;
      if (since >= throttleMs) {
        lastSendRef.current = now;
        pendingRef.current = null;
        cancelThrottle();
        onSendRef.current(v);
      } else {
        pendingRef.current = v;
        if (throttleTimerRef.current == null) {
          throttleTimerRef.current = window.setTimeout(flushPending, throttleMs - since);
        }
      }
    },
    [throttleMs, flushPending],
  );

  const onInput = useCallback(
    (e: React.FormEvent<HTMLInputElement>) => {
      const v = Number((e.currentTarget as HTMLInputElement).value);
      setLocal(v);
      send(v);
    },
    [send],
  );

  const beginInteract = useCallback(() => {
    ownedRef.current = true;
    cancelSettle();
  }, []);

  const commit = useCallback(
    (v: number) => {
      cancelThrottle();
      pendingRef.current = null;
      lastSendRef.current = Date.now();
      onSendRef.current(v);
      if (settleResendMs > 0) {
        settleTimerRef.current = window.setTimeout(() => {
          settleTimerRef.current = null;
          (onSettleRef.current ?? onSendRef.current)(v);
        }, settleResendMs);
      }
    },
    [settleResendMs],
  );

  const onPointerDown = useCallback(() => {
    beginInteract();
  }, [beginInteract]);
  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLInputElement>) => {
      const v = Number((e.currentTarget as HTMLInputElement).value);
      commit(v);
    },
    [commit],
  );
  const onKeyDown = useCallback(() => {
    beginInteract();
  }, [beginInteract]);
  const onKeyUp = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      const v = Number((e.currentTarget as HTMLInputElement).value);
      commit(v);
    },
    [commit],
  );

  useEffect(() => {
    return () => {
      cancelThrottle();
      cancelSettle();
    };
  }, []);

  return { value: local, onInput, onPointerDown, onPointerUp, onKeyDown, onKeyUp };
}
