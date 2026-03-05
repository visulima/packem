/// <reference types="vitest" />
import { defineConfig } from "vitest/config";

// Root-level vitest config used when running `vitest related --run` from the monorepo root (e.g. via lint-staged).
// Individual packages have their own vitest.config.ts with more specific settings.
export default defineConfig({
    test: {
        testTimeout: 30_000,
    },
});
