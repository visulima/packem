import { defineConfig } from "@visulima/packem/config";
import transformer from "@visulima/packem/transformer/esbuild";

export default defineConfig({
    transformer,
    // This will ignore the "images", "assets", and "styles" export keys
    // so they won't be processed as build entries
    ignoreExportKeys: ["images", "assets", "styles"],
    // Allow additional file extensions in exports validation
    validation: {
        packageJson: {
            allowedExportExtensions: [".svg", ".css", ".png", ".jpg", ".jpeg", ".gif", ".webp"],
        },
    },
    // Copy assets to the output directory
    rollup: {
        copy: {
            targets: [
                {
                    src: "src/images",
                    dest: ".",
                },
                {
                    src: "src/assets",
                    dest: ".",
                },
                {
                    src: "src/styles.css",
                    dest: ".",
                },
            ],
        },
    },
});
