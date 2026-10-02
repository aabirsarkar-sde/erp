import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  { ignores: [".next/**", "node_modules/**", "uploads/**", "next-env.d.ts", "docs/**", "tests/e2e/.out/**"] },
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // logos/icons are tiny local SVGs; next/image adds nothing for them
      "@next/next/no-img-element": "off",
      // React Compiler advisories (new in Next 16). Kept visible as warnings; fix when touching the file.
      "react-hooks/static-components": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
    },
  },
];

export default config;
