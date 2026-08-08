import { cpSync, rmSync } from "node:fs";
import { builtinModules } from "node:module";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import { globalExternals } from "./build/global-externals.js";

const runtimeExternals = ["electron", /^electron\//, ...builtinModules, ...builtinModules.map((m) => `node:${m}`)];

// monaco-editor's ESM source has side-effect CSS imports (e.g.
// `import './actionbar.css'`). Under build.formats:["cjs"] + preserveModules,
// Vite's CSS pipeline emits an empty `/* empty css */` placeholder but leaves
// the pre-assigned CJS binding dangling (`const require_dnd = ;`) — a
// SyntaxError when Freelens requires the renderer as CJS. This plugin
// short-circuits every `.css` import coming from inside node_modules/monaco-editor
// to an empty module, so the binding resolves to `''` instead of nothing. The
// extension's renderer uses no CSS imports (all inline styles), so stripping
// Monaco's CSS is safe here.
// ponytail: scoped to monaco-editor — a CSS import from this extension's own
// source would still go through Vite's normal CSS handling.
function emptyMonacoCss() {
  return {
    name: "empty-monaco-css",
    enforce: "pre",
    resolveId(source, importer) {
      if (source.endsWith(".css") && importer && importer.includes("monaco-editor")) {
        return `\0empty-monaco-css:${source.replace(/\.css$/, "-css")}`;
      }
      return null;
    },
    load(id) {
      if (id.startsWith("\0empty-monaco-css:")) return "export default '';";
      return null;
    },
  };
}

// Copies provider-specific k8s-aware scaffolds from src/main/scaffolds/ to
// out/main/scaffolds/ at the end of the main build, so resolveScaffoldsRoot()
// finds the bundled copies in production. Runs at
// closeBundle so it lands after rolldown writes out/main/index.js.
function copyScaffold() {
  return {
    name: "copy-scaffold",
    apply: "build",
    closeBundle() {
      const src = resolve(process.cwd(), "src", "main", "scaffolds");
      const dest = resolve(process.cwd(), "out", "main", "scaffolds");
      rmSync(dest, { recursive: true, force: true });
      cpSync(src, dest, { recursive: true });
    },
  };
}

export default defineConfig({
  main: {
    build: {
      lib: { entry: resolve(__dirname, "src/main/index.ts"), formats: ["cjs"] },
      rolldownOptions: {
        external: runtimeExternals,
        output: {
          exports: "named",
          preserveModules: (process.env.VITE_PRESERVE_MODULES ?? "true") === "true",
          preserveModulesRoot: "src/main",
        },
      },
      sourcemap: true,
    },
    oxc: { decorator: { legacy: true, emitDecoratorMetadata: true } },
    plugins: [
      react({
        babel: { plugins: [["@babel/plugin-proposal-decorators", { version: "2023-05" }]] },
      }),
      globalExternals({
        "@freelensapp/extensions": "global.LensExtensions",
        mobx: "global.Mobx",
      }),
      copyScaffold(),
    ],
  },
  preload: {
    build: {
      lib: { entry: resolve(__dirname, "src/renderer/index.tsx"), formats: ["cjs"] },
      outDir: "out/renderer",
      rolldownOptions: {
        external: runtimeExternals,
        output: {
          exports: "named",
          preserveModules: (process.env.VITE_PRESERVE_MODULES ?? "true") === "true",
          preserveModulesRoot: "src/renderer",
        },
      },
      sourcemap: true,
    },
    css: { modules: { localsConvention: "camelCaseOnly" } },
    oxc: { decorator: { legacy: true, emitDecoratorMetadata: true } },
    // monaco-editor ships ESM workers that Vite's ?worker handles natively.
    // rollupOptions.input is not needed; the renderer graph pulls workers via
    // `?worker` imports in provider-file-editor.tsx. optimizeDeps kept permissive
    // so Vite pre-bundles monaco-editor's ESM correctly under dev.
    optimizeDeps: {
      include: ["monaco-editor/esm/vs/editor/editor.worker", "monaco-editor"],
    },
    plugins: [
      emptyMonacoCss(),
      react({
        babel: { plugins: [["@babel/plugin-proposal-decorators", { version: "2023-05" }]] },
      }),
      globalExternals({
        "@freelensapp/extensions": "global.LensExtensions",
        mobx: "global.Mobx",
        "mobx-react": "global.MobxReact",
        react: "global.React",
        "react-dom": "global.ReactDom",
        "react-router-dom": "global.ReactRouterDom",
        "react/jsx-runtime": "global.ReactJsxRuntime",
      }),
    ],
  },
});
