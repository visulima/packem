import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { Plugin } from "rollup";

// Supports:
// - import html from "./index.html" with { type: "text" }
// - import bytes from "./photo.png" with { type: "bytes" }
// - const bytes = await import("./photo.png", { with: { type: "bytes" } })
//
// Proposals:
// - https://github.com/tc39/proposal-import-attributes (with syntax, Stage 4)
// - https://github.com/tc39/proposal-import-text (type: "text", Stage 2)
// - https://github.com/tc39/proposal-import-bytes (type: "bytes", Stage 2.7)
//
// Note: The import-bytes proposal specifies Uint8Array backed by an immutable ArrayBuffer.
// We produce a mutable Uint8Array because ArrayBuffer.prototype.transferToImmutable()
// is not yet available in stable runtimes (proposal at Stage 2.7).
//
// Implementation: we rewrite source-level `import ... with { type: "text"|"bytes" }`
// statements to use a counter-based virtual module ID. This works uniformly under
// rollup and rolldown — rolldown 1.0 doesn't pass `attributes` to plugin resolveId
// hooks, so source-level rewriting is the only way to intercept attribute-typed
// imports before the bundler's default text/binary loader sees the path.
//
// The virtual ID is counter-based (no embedded file extension) so other plugins'
// extension-based filters (e.g., debarrel for .tsx) won't accidentally match it
// and try to readFile() on a non-existent path.
const VIRTUAL_PREFIX = "\0packem-import-attribute/";

// Matches:  import <bindings>? from "path" with { type: "text"|"bytes" }
// Bindings can include default, namespace, named, side-effect-only forms.
const STATIC_IMPORT_WITH_ATTR = /(import[\s\S]+?from\s*["'])([^"']+)(["'])\s*with\s*\{\s*type\s*:\s*["'](text|bytes)["']\s*\}/g;

// Matches:  import("path", { with: { type: "text"|"bytes" } })
const DYNAMIC_IMPORT_WITH_ATTR = /(\bimport\s*\(\s*["'])([^"']+)["']\s*,\s*\{\s*with\s*:\s*\{\s*type\s*:\s*["'](text|bytes)["']\s*\}\s*\}\s*\)/g;

const SOURCE_FILE = /\.[mc]?[jt]sx?$/;

interface AttributeEntry {
    importer: string;
    source: string;
    type: "bytes" | "text";
}

// eslint-disable-next-line import/prefer-default-export -- public API surface stays named for plugin consumers
export const importAttributesPlugin = (): Plugin => {
    const entries = new Map<string, AttributeEntry>();
    let counter = 0;

    const allocateId = (entry: AttributeEntry): string => {
        const id = `${VIRTUAL_PREFIX}${String(counter)}`;

        counter += 1;
        entries.set(id, entry);

        return id;
    };

    return {
        buildStart() {
            entries.clear();
            counter = 0;
        },

        async load(id) {
            const entry = entries.get(id);

            if (!entry) {
                // eslint-disable-next-line unicorn/no-null
                return null;
            }

            const { importer, source, type } = entry;

            if (!source.startsWith("./") && !source.startsWith("../") && !source.startsWith("/")) {
                // eslint-disable-next-line unicorn/no-null
                return null;
            }

            const filePath = source.startsWith("/") ? source : resolve(dirname(importer), source);

            this.addWatchFile(filePath);

            if (type === "text") {
                const content = await readFile(filePath, "utf8");

                return `export default ${JSON.stringify(content)}`;
            }

            // type === "bytes"
            const content = await readFile(filePath);

            return `export default new Uint8Array([${content.join(",")}])`;
        },

        name: "packem:import-attributes",

        resolveId(source, _importer) {
            if (!source.startsWith(VIRTUAL_PREFIX)) {
                // eslint-disable-next-line unicorn/no-null
                return null;
            }

            // Our virtual IDs are already absolute — return as-is so the bundler doesn't
            // try to resolve them against the filesystem.
            if (entries.has(source)) {
                return source;
            }

            // eslint-disable-next-line unicorn/no-null
            return null;
        },

        transform(code, id) {
            // Skip our own virtual modules and non-source files.
            const baseId = id.split("?")[0] ?? id;

            if (baseId.startsWith(VIRTUAL_PREFIX) || !SOURCE_FILE.test(baseId)) {
                // eslint-disable-next-line unicorn/no-null
                return null;
            }

            // Cheap pre-check before running the regex on every source file.
            if (!code.includes("with") || (!code.includes("text") && !code.includes("bytes"))) {
                // eslint-disable-next-line unicorn/no-null
                return null;
            }

            const rewritten = code
                .replaceAll(STATIC_IMPORT_WITH_ATTR, (_match, before: string, modulePath: string, quote: string, type: string) => {
                    const virtualId = allocateId({ importer: id, source: modulePath, type: type as "bytes" | "text" });

                    return `${before}${virtualId}${quote}`;
                })
                .replaceAll(DYNAMIC_IMPORT_WITH_ATTR, (_match, before: string, modulePath: string, type: string) => {
                    const virtualId = allocateId({ importer: id, source: modulePath, type: type as "bytes" | "text" });

                    // Drop the attributes object entirely; the virtual ID encodes the type.
                    return `${before}${virtualId}")`;
                });

            if (rewritten === code) {
                // eslint-disable-next-line unicorn/no-null
                return null;
            }

            // eslint-disable-next-line unicorn/no-null
            return { code: rewritten, map: null };
        },
    };
};
