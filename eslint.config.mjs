// ESLint flat config (ESLint 10 + Next 16). `next lint` was removed in
// Next 16, so we invoke ESLint directly via the "lint" npm script.
import coreWebVitals from "eslint-config-next/core-web-vitals";

/** @type {import('eslint').Linter.Config[]} */
const config = [
  { ignores: [".next/**", "node_modules/**", "public/**", "*.config.js"] },
  ...coreWebVitals,
  {
    rules: {
      // React Compiler-adjacent rules newly enabled by eslint-config-next 16.
      // Every hit in this shipped app is an idiomatic pattern — effects that
      // sync to an external system (timers, reset-on-prop-change) and lazy-init
      // refs (e.g. a stable per-round placeholder). Refactoring working screens
      // to satisfy them isn't warranted. exhaustive-deps + rules-of-hooks stay
      // as errors below — they catch real bugs.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/purity": "off",
    },
  },
];

export default config;
