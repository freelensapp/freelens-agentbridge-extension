import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    exclude: ["integration/**", "node_modules/**", "out/**"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    passWithNoTests: true,
    alias: {
      "@freelensapp/extensions": fileURLToPath(new URL("./test/freelens-extensions.ts", import.meta.url)),
    },
  },
});
