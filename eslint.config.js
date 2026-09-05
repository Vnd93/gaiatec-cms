import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "public/**", "supabase/functions/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/static-components": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/refs": "off",
      "react-hooks/purity": "off",
      "react-hooks/exhaustive-deps": "error",
      "react-refresh/only-export-components": ["error", { allowConstantExport: true }],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/ban-ts-comment": "off",
    },
  },
  {
    // These modules intentionally co-locate providers/components with their public hooks,
    // schema builders, or UI variants. Their exports are stable production APIs; only the
    // development-only Fast Refresh boundary is inapplicable.
    files: [
      "src/**/*Context.tsx",
      "src/public/site-shell-context.tsx",
      "src/admin/pages/AdminBulkImportPage.tsx",
      "src/app/components/ResponsiveImage.tsx",
      "src/app/components/SEO.tsx",
      "src/app/components/ServiceWorkerRegister.tsx",
      "src/app/components/useScrollAnimation.tsx",
      "src/app/components/ui/*.{ts,tsx}",
      "src/app/pages/ProdutosPage.tsx",
      "src/app/rdo/components/AssinaturaBadge.tsx",
      "src/app/rdo/lib/pdf.tsx",
    ],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
  {
    files: ["**/*.{js,mjs}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.node, ...globals.browser },
    },
  },
);
