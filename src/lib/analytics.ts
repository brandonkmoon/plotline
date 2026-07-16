declare global {
  interface Window {
    plausible?: (
      name: string,
      options?: { props?: Record<string, string> },
    ) => void;
  }
}

export function trackEvent(name: string, props?: Record<string, string>) {
  if (typeof window !== "undefined" && window.plausible) {
    window.plausible(name, { props });
  }
}
