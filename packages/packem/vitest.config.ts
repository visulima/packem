import { getVitestConfig } from "../../tools/get-vitest-config";

// https://vitejs.dev/config/
export default getVitestConfig({
    test: {
        testTimeout: 15_000,
    },
});
