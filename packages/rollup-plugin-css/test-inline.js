import { rollupCssPlugin } from "./src/index.ts";

// Test configuration for inline mode
const config = {
    plugins: [
        rollupCssPlugin({
            autoModules: true,
            extensions: [".css"],
            mode: "inline",
            namedExports: true,
        }),
    ],
};

console.log("Inline mode configuration:", JSON.stringify(config, null, 2));
