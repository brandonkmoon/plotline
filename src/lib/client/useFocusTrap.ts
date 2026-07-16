import { useEffect, type RefObject } from "react";

// Accessibility helper for modal dialogs: while the modal is mounted it moves
// focus inside, keeps Tab/Shift+Tab cycling within the modal, closes on Escape,
// and restores focus to whatever was focused before it opened. Pair it with
// role="dialog" + aria-modal="true" on the same element (which needs
// tabIndex={-1} so the container itself is focusable as a fallback).
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
  onClose?: () => void
) {
  useEffect(() => {
    if (!enabled) return;
    const container = ref.current;
    if (!container) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(
        container.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => el.offsetParent !== null);

    // Move focus into the modal.
    (focusables()[0] ?? container).focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    container.addEventListener("keydown", onKeyDown);
    return () => {
      container.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [ref, enabled, onClose]);
}
