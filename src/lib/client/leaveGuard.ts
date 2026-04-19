/**
 * Module-level leave guard.
 *
 * BackButtonGuard registers a callback when a game is active.
 * Any component (e.g. PlaybillBanner) can call requestLeave() to
 * show the confirmation dialog before navigating away. If no guard
 * is active the action proceeds immediately.
 */

type GuardCallback = (onConfirm: () => void) => void;

let activeGuard: GuardCallback | null = null;

export function registerLeaveGuard(fn: GuardCallback): void {
  activeGuard = fn;
}

export function clearLeaveGuard(): void {
  activeGuard = null;
}

export function requestLeave(onConfirm: () => void): void {
  if (activeGuard) {
    activeGuard(onConfirm);
  } else {
    onConfirm();
  }
}
