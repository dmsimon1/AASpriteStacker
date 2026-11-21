/**
 * Mobile-first Multi-Touch Controller for @aastack/core games.
 * Tracks independent pointerIds so left-hand steering thumbstick and right-hand
 * Boost / Roll / Camera buttons work simultaneously with zero scroll/zoom bounce.
 */

export interface VirtualControlState {
  /** Normalized steering axes in [-1, 1] (x = yaw/bank, y = pitch/climb). */
  steerX: number;
  steerY: number;
  /** True while player is actively dragging the thumbstick. */
  steering: boolean;
  /** True while boost / thruster button is held. */
  thrust: boolean;
}

export interface TouchControllerOptions {
  /** Container covering the left steering zone (usually the full stage or left half). */
  steerZone: HTMLElement;
  /** Optional visual thumbstick base & knob elements. */
  stickBase?: HTMLElement | null;
  stickKnob?: HTMLElement | null;
  /** Maximum thumb travel radius in CSS pixels (default 46). */
  maxRadius?: number;
}

export function createTouchController(opts: TouchControllerOptions): {
  state: VirtualControlState;
  destroy: () => void;
} {
  const maxR = opts.maxRadius ?? 46;
  const state: VirtualControlState = {
    steerX: 0,
    steerY: 0,
    steering: false,
    thrust: false,
  };

  let activePointerId: number | null = null;
  let originX = 0;
  let originY = 0;

  const showStick = (visible: boolean, x = 0, y = 0, dx = 0, dy = 0) => {
    if (opts.stickBase) {
      opts.stickBase.style.opacity = visible ? "1" : "0";
      if (visible) {
        opts.stickBase.style.left = `${x}px`;
        opts.stickBase.style.top = `${y}px`;
      }
    }
    if (opts.stickKnob) {
      opts.stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    }
  };

  const onDown = (e: PointerEvent) => {
    if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
    if ((e.target as HTMLElement | null)?.closest("button, select, input, .hud-interactive")) return;
    if (activePointerId !== null) return;
    activePointerId = e.pointerId;
    opts.steerZone.setPointerCapture?.(e.pointerId);
    const rect = opts.steerZone.getBoundingClientRect();
    originX = e.clientX - rect.left;
    originY = e.clientY - rect.top;
    state.steering = true;
    state.steerX = 0;
    state.steerY = 0;
    showStick(true, originX, originY, 0, 0);
  };

  const onMove = (e: PointerEvent) => {
    if (e.pointerId !== activePointerId) return;
    const rect = opts.steerZone.getBoundingClientRect();
    let dx = e.clientX - rect.left - originX;
    let dy = e.clientY - rect.top - originY;
    const d = Math.hypot(dx, dy);
    if (d > maxR) {
      dx = (dx / d) * maxR;
      dy = (dy / d) * maxR;
    }
    state.steerX = dx / maxR;
    state.steerY = dy / maxR;
    showStick(true, originX, originY, dx, dy);
  };

  const onUp = (e: PointerEvent) => {
    if (e.pointerId !== activePointerId) return;
    activePointerId = null;
    state.steering = false;
    state.steerX = 0;
    state.steerY = 0;
    showStick(false);
  };

  opts.steerZone.addEventListener("pointerdown", onDown);
  opts.steerZone.addEventListener("pointermove", onMove);
  opts.steerZone.addEventListener("pointerup", onUp);
  opts.steerZone.addEventListener("pointercancel", onUp);

  return {
    state,
    destroy() {
      opts.steerZone.removeEventListener("pointerdown", onDown);
      opts.steerZone.removeEventListener("pointermove", onMove);
      opts.steerZone.removeEventListener("pointerup", onUp);
      opts.steerZone.removeEventListener("pointercancel", onUp);
    },
  };
}
