import MagicString from "magic-string";
import type { Plugin, NormalizedOutputOptions, RenderedChunk } from "rollup";

const fixDynamicImportExtension = (): Plugin =>
    ({
        name: "packem:fix-dynamic-import-extension",
        renderChunk(code: string, _chunk: RenderedChunk, outputOptions: NormalizedOutputOptions) {
            if (outputOptions.format === "es" || outputOptions.format === "cjs") {
                const magicString = new MagicString(code);
                const extension = outputOptions.format === "es" ? "mjs" : "cjs";
                // Match .ts extensions but exclude .d.ts (negative lookbehind)
                const regex = /(import\(.*?)(?<!\.d)(\.ts)(?=['´"`]\))/g;

                let hasChanged = false;
                let match;

                // eslint-disable-next-line no-cond-assign
                while ((match = regex.exec(code)) !== null) {
                    const [, beforeExtension, tsExtension] = match;

                    if (beforeExtension && tsExtension) {
                        const start = match.index + beforeExtension.length;
                        const end = start + tsExtension.length;

                        magicString.overwrite(start, end, `.${extension}`);
                        hasChanged = true;
                    }
                }

                if (hasChanged) {
                    return {
                        code: magicString.toString(),
                        map: outputOptions.sourcemap ? magicString.generateMap({ hires: true }) : undefined,
                    };
                }
            }

            return undefined;
        },
    }) as Plugin;

export default fixDynamicImportExtension;
