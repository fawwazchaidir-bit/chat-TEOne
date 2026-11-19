import js from "@eslint/js";
import tseslint from "typescript-eslint";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  { ignores: [".next/**", "node_modules/**", "drizzle/**", "coverage/**", ".test-results/**", "next-env.d.ts", "playwright-report/**", "test-results/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { "@next/next": nextPlugin, "react-hooks": reactHooks },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  { files: ["**/*.mjs", "**/*.config.*"], languageOptions: { globals: globals.node } },
  {
    // Skrip CLI boleh memakai console.log untuk keluaran.
    files: ["scripts/**/*.ts", "scripts/**/*.mjs", "tests/**/*.ts"],
    rules: { "no-console": "off" },
  },
);
