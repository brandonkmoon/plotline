// ESLint flat config (ESLint 10 + Next 16). `next lint` was removed in
// Next 16, so we invoke ESLint directly via the "lint" npm script.
import coreWebVitals from "eslint-config-next/core-web-vitals";

/** @type {import('eslint').Linter.Config[]} */
const config = [
  { ignores: [".next/**", "node_modules/**", "public/**", "*.config.js"] },
  ...coreWebVitals,
];

export default config;
