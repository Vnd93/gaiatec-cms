import { defineConfig } from "vite";
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import viteCompression from "vite-plugin-compression";

export default defineConfig({
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),

    // Pre-compressão Gzip — Cloudflare serve direto sem precisar comprimir runtime
    viteCompression({
      algorithm: "gzip",
      ext: ".gz",
      threshold: 10240, // só comprime arquivos > 10 KB
      deleteOriginFile: false, // mantém original para browsers sem suporte
      verbose: false,
    }),

    // Pre-compressão Brotli — ~20% melhor que Gzip, suportado por todos browsers modernos
    viteCompression({
      algorithm: "brotliCompress",
      ext: ".br",
      threshold: 10240,
      deleteOriginFile: false,
      verbose: false,
    }),

    // NOTA: vite-plugin-image-optimizer FOI REMOVIDO.
    // Imagens já são pre-otimizadas localmente via scripts/generate-responsive-images.mjs
    // (sharp gerando AVIF + WebP em 3 tamanhos). Re-otimizar AVIF aqui:
    //   1. Ineficiente (AVIF já é ótimo, plugin tentava +910% de tamanho)
    //   2. Lento no CF Pages (timeout de build)
    //   3. Requer sharp/svgo no environment de build
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      "@": path.resolve(__dirname, "./src"),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ["**/*.svg", "**/*.csv"],

  // The admin AVIF encoder uses a module Web Worker and splits its WASM glue.
  // ES output is required for that worker graph; public routes do not load it.
  worker: {
    format: "es",
  },

  build: {
    // Consumido pelo orçamento EV2.6 para distinguir imports iniciais de lazy chunks.
    manifest: true,
    // Modern browsers (smaller bundles via newer JS features)
    target: "es2020",

    // CSS code splitting (default true, but explicit)
    cssCodeSplit: true,

    // Reportar bundles maiores que 600 KB (warning)
    chunkSizeWarningLimit: 600,

    rollupOptions: {
      output: {
        // Vendor chunking — separa libs grandes do código da app
        // Resultado: cache mais eficiente (vendor não muda) + paralelização de download
        manualChunks: {
          // React core (sempre necessário)
          "react-vendor": ["react", "react-dom", "react-router"],

          // Animação (motion/framer) — usado em quase tudo
          "motion-vendor": ["motion"],

          // Radix UI primitives — só carrega quando necessário
          "radix-vendor": [
            "@radix-ui/react-accordion",
            "@radix-ui/react-alert-dialog",
            "@radix-ui/react-aspect-ratio",
            "@radix-ui/react-avatar",
            "@radix-ui/react-checkbox",
            "@radix-ui/react-collapsible",
            "@radix-ui/react-context-menu",
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-hover-card",
            "@radix-ui/react-label",
            "@radix-ui/react-menubar",
            "@radix-ui/react-navigation-menu",
            "@radix-ui/react-popover",
            "@radix-ui/react-progress",
            "@radix-ui/react-radio-group",
            "@radix-ui/react-scroll-area",
            "@radix-ui/react-select",
            "@radix-ui/react-separator",
            "@radix-ui/react-slider",
            "@radix-ui/react-slot",
            "@radix-ui/react-switch",
            "@radix-ui/react-tabs",
            "@radix-ui/react-toggle",
            "@radix-ui/react-toggle-group",
            "@radix-ui/react-tooltip",
          ],

          // Charts (recharts) — só carrega no EconomicSimulator
          "charts-vendor": ["recharts"],

          // Supabase
          "supabase-vendor": ["@supabase/supabase-js"],

          // Forms
          "form-vendor": ["react-hook-form", "react-day-picker"],
        },
      },
    },
  },
});
