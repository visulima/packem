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
// statements to use a self-describing virtual module ID. This works uniformly under
// rollup and rolldown — rolldown 1.0 doesn't pass `attributes` to plugin resolveId
// hooks, so source-level rewriting is the only way to intercept attribute-typed
// imports before the bundler's default text/binary loader sees the path.
//
// The virtual ID carries the attribute type and the resolved file path, so `load` can
// serve it without any prior state. A counter-based ID does not survive packem's file
// cache: on a second build the importer's transform is replayed from cache, nothing
// re-registers the ID, and the module fails to load. Encoding the path instead makes the
// ID a pure function of its input.
//
// base64url keeps the ID free of a file extension, so other plugins' extension-based
// filters (e.g., debarrel for .tsx) won't accidentally match it and try to readFile()
// on a non-existent path.
const VIRTUAL_PREFIX = "\0packem-import-attribute/";

type AttributeType = "bytes" | "text";

const encodeAttributeId = (type: AttributeType, filePath: string): string => `${VIRTUAL_PREFIX}${type}/${Buffer.from(filePath, "utf8").toString("base64url")}`;

const decodeAttributeId = (id: string): { filePath: string; type: AttributeType } | undefined => {
    if (!id.startsWith(VIRTUAL_PREFIX)) {
        return undefined;
    }

    const rest = id.slice(VIRTUAL_PREFIX.length);
    const separator = rest.indexOf("/");

    if (separator === -1) {
        return undefined;
    }

    const type = rest.slice(0, separator);

    if (type !== "bytes" && type !== "text") {
        return undefined;
    }

    return { filePath: Buffer.from(rest.slice(separator + 1), "base64url").toString("utf8"), type };
};

// Only relative and absolute specifiers name a file this plugin can read. A bare
// specifier is left exactly as written, so the bundler resolves it as it normally would.
const isLocalSpecifier = (source: string): boolean => source.startsWith("./") || source.startsWith("../") || source.startsWith("/");

const resolveLocalSpecifier = (importer: string, source: string): string => (source.startsWith("/") ? source : resolve(dirname(importer), source));

// Matches:  import <bindings>? from "path" with { type: "text"|"bytes" }
// Bindings can include default, namespace, named, side-effect-only forms.
//
// The clause between `import` and `from` is bound to characters that legitimately
// appear in an import clause — identifiers, braces, commas, `as`, whitespace and
// `$`/`_` — and explicitly NOT `;`, quotes or parentheses. This keeps the gap from
// the catastrophic `[\s\S]+?` (which could span arbitrarily far, scanning across
// statements/strings/comments and degrading to polynomial time on files with many
// imports) while still matching every real binding form.
const STATIC_IMPORT_WITH_ATTR = /(import[\w$*{},\s]*?from\s*["'])([^"']+)(["'])\s*with\s*\{\s*type\s*:\s*["'](text|bytes)["']\s*\}/g;

// Matches:  import("path", { with: { type: "text"|"bytes" } })
const DYNAMIC_IMPORT_WITH_ATTR = /(\bimport\s*\(\s*["'])([^"']+)["']\s*,\s*\{\s*with\s*:\s*\{\s*type\s*:\s*["'](text|bytes)["']\s*\}\s*\}\s*\)/g;

const SOURCE_FILE = /\.[mc]?[jt]sx?$/;

// eslint-disable-next-line import/prefer-default-export -- public API surface stays named for plugin consumers
export const importAttributesPlugin = (): Plugin =>
    ({
        async load(id) {
            const entry = decodeAttributeId(id);

            if (!entry) {
                // eslint-disable-next-line unicorn/no-null
                return null;
            }

            const { filePath, type } = entry;

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
            // Our virtual IDs already name the file they stand for — return as-is so the
            // bundler doesn't try to resolve them against the filesystem.
            if (decodeAttributeId(source)) {
                return source;
            }

            // eslint-disable-next-line unicorn/no-null
            return null;
        },

        transform(code, id) {
            // Skip our own virtual modules and non-source files.
            const baseId = id.split("?", 1)[0] ?? id;

            if (baseId.startsWith(VIRTUAL_PREFIX) || !SOURCE_FILE.test(baseId)) {
                // eslint-disable-next-line unicorn/no-null
                return null;
            }

            // Cheap pre-check before running the regex on every source file. The
            // attribute form always contains all of `with`, `type`, and one of
            // `text`/`bytes`, so requiring every token short-circuits the vast
            // majority of files before the (now bounded) regex runs.
            if (!code.includes("with") || !code.includes("type") || (!code.includes("text") && !code.includes("bytes"))) {
                // eslint-disable-next-line unicorn/no-null
                return null;
            }

            const rewritten = code
                .replaceAll(STATIC_IMPORT_WITH_ATTR, (match, before: string, modulePath: string, quote: string, type: string) => {
                    if (!isLocalSpecifier(modulePath)) {
                        return match;
                    }

                    return `${before}${encodeAttributeId(type as AttributeType, resolveLocalSpecifier(id, modulePath))}${quote}`;
                })
                .replaceAll(DYNAMIC_IMPORT_WITH_ATTR, (match, before: string, modulePath: string, type: string) => {
                    if (!isLocalSpecifier(modulePath)) {
                        return match;
                    }

                    // Drop the attributes object entirely; the virtual ID encodes the type.
                    return `${before}${encodeAttributeId(type as AttributeType, resolveLocalSpecifier(id, modulePath))}")`;
                });

            if (rewritten === code) {
                // eslint-disable-next-line unicorn/no-null
                return null;
            }

            // eslint-disable-next-line unicorn/no-null
            return { code: rewritten, map: null };
        },
    }) satisfies Plugin;
