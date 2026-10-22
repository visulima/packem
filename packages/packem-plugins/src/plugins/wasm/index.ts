import { readFile } from "node:fs/promises";

import type { FilterPattern } from "@rollup/pluginutils";
import { createFilter } from "@rollup/pluginutils";
import { basename, dirname, extname, resolve } from "@visulima/path";
import type { Plugin, PluginContext } from "rollup";

import type { Delivery, Form } from "./codegen";
import { generateWasmModule } from "./codegen";
import { parseWasmModuleShape, WasmParseError } from "./parse";
import { findSourcePhaseImports } from "./scan";

/**
 * Synchronous compilation on a browser main thread is capped at 4 KB by the WebAssembly
 * JS API, so anything larger has to go through the asynchronous path there.
 */
const BROWSER_SYNC_LIMIT = 4096;

const SOURCE_FILE = /\.[cm]?[jt]sx?$/;

/** Default `include`: every `.wasm` file. */
const WASM_FILE = /\.wasm$/;

/**
 * Prefix for the virtual module a source-phase import is rewritten to.
 *
 * The resolved file path is base64url-encoded into the id itself rather than held in a
 * side map keyed by a counter. A counter is not stable across builds, so a transform
 * result replayed from packem's build cache would reference an id the current process
 * never registered, and the module would fail to load. Encoding the path makes the id a
 * pure function of its input: it survives caching, and `load` needs no prior state.
 * Base64url also keeps the id free of a `.wasm` suffix, so other plugins' extension
 * filters cannot match it and try to read it from disk.
 */
const VIRTUAL_SOURCE_PREFIX = "\0packem-wasm-source/";

const encodeSourceId = (filePath: string): string => `${VIRTUAL_SOURCE_PREFIX}${Buffer.from(filePath, "utf8").toString("base64url")}`;

const decodeSourceId = (id: string): string | undefined =>
    id.startsWith(VIRTUAL_SOURCE_PREFIX) ? Buffer.from(id.slice(VIRTUAL_SOURCE_PREFIX.length), "base64url").toString("utf8") : undefined;

type WasmDeliveryMode = "asset" | "auto" | "inline" | "preserve";

type WasmInstantiation = "auto" | "await" | "sync";

interface WasmPluginOptions {
    /**
     * Files the plugin should ignore.
     */
    exclude?: FilterPattern;

    /**
     * Name template for files written in `asset` mode. Supports `[name]`, `[hash]` and
     * `[extname]`.
     * @default "[name]-[hash][extname]"
     */
    fileName?: string;

    /**
     * Files the plugin should handle.
     * @default /\.wasm$/
     */
    include?: FilterPattern;

    /**
     * How the module is compiled and instantiated.
     *
     * - `"sync"` uses the `WebAssembly.Module`/`Instance` constructors. It needs no
     * top-level `await`, so it works in CJS output, but a browser main thread refuses to
     * compile more than 4 KB this way.
     * - `"await"` uses top-level `await`, which lifts that limit but is ESM-only.
     * - `"auto"` picks `"await"` only where it is both needed and available.
     * @default "auto"
     */
    instantiation?: WasmInstantiation;

    /**
     * Inline threshold in bytes for {@link WasmPluginOptions.mode `mode: "auto"`}.
     * @default 14336
     */
    maxFileSize?: number;

    /**
     * How the module's bytes reach the output.
     *
     * - `"inline"` embeds them as base64 in the JavaScript, keeping the output a single
     * self-contained file.
     * - `"asset"` writes the `.wasm` next to the chunk and loads it at runtime.
     * - `"preserve"` leaves the import untouched so a downstream bundler, or a runtime
     * with native WebAssembly module support, handles it.
     * - `"auto"` inlines up to the inline threshold and emits an asset beyond it.
     * @default "auto"
     */
    mode?: WasmDeliveryMode;

    /**
     * Prefix prepended to the emitted asset's URL in `asset` mode, for output served
     * from a known base path. Without it the module is loaded relative to the chunk.
     */
    publicPath?: string;

    /**
     * The runtime the output targets. `"browser"` avoids `node:fs` and respects the
     * 4 KB synchronous-compilation limit.
     * @default "node"
     */
    targetEnv?: "browser" | "node";

    /**
     * Whether the output can carry top-level `await`. packem sets this to `false`
     * whenever the build also emits CommonJS, since one module graph feeds both outputs.
     * @default true
     */
    topLevelAwait?: boolean;
}

interface Emission {
    fileName: string;
    source: Uint8Array;
}

/** A rewritten declaration, addressed by offset rather than by its text. */
interface Splice {
    end: number;
    start: number;
    text: string;
}

const hashBytes = async (bytes: Uint8Array): Promise<string> => {
    const { createHash } = await import("node:crypto");

    return createHash("sha256").update(bytes).digest("hex").slice(0, 8);
};

/**
 * Handles `.wasm` files in the module graph.
 *
 * Three import forms are recognised, all backed by the same wrapper generator:
 *
 * - `import { add } from "./add.wasm"` — [ESM integration](https://github.com/WebAssembly/esm-integration):
 * the module's WebAssembly exports become the wrapper's named exports, and its
 * WebAssembly imports become the wrapper's own ES imports.
 * - `import source module from "./add.wasm"` — [source phase imports](https://github.com/tc39/proposal-source-phase-imports):
 * the binding is a compiled, uninstantiated `WebAssembly.Module`.
 * - `import init from "./add.wasm"` — the default export kept for compatibility with
 * `@rollup/plugin-wasm`, whose init function resolves to a `WebAssembly.Instance`.
 *
 * The plugin is backend-agnostic: it runs under both rollup and rolldown.
 * @param options Delivery, instantiation and filtering options.
 * @returns The rollup/rolldown plugin.
 */
const wasmPlugin = (options: WasmPluginOptions = {}): Plugin => {
    const {
        exclude,
        fileName = "[name]-[hash][extname]",
        include = WASM_FILE,
        instantiation = "auto",
        maxFileSize = 14_336,
        mode = "auto",
        publicPath,
        targetEnv = "node",
        topLevelAwait = true,
    } = options;

    const filter = createFilter(include, exclude);

    const emissions = new Map<string, Emission>();

    /**
     * Decides whether a module is inlined or emitted beside the chunk, registering the
     * emission in the latter case.
     */
    const resolveDelivery = async (context: PluginContext, filePath: string, bytes: Uint8Array): Promise<Delivery> => {
        if (mode === "inline" || (mode === "auto" && bytes.byteLength <= maxFileSize)) {
            return { base64: Buffer.from(bytes).toString("base64"), kind: "inline" };
        }

        const name = fileName
            .replaceAll("[name]", basename(filePath, extname(filePath)))
            .replaceAll("[hash]", await hashBytes(bytes))
            .replaceAll("[extname]", extname(filePath));

        // `publicPath` pins the location, so the URL is fixed and needs no reference.
        if (publicPath !== undefined) {
            emissions.set(filePath, { fileName: name, source: bytes });

            return { kind: "asset", url: `${publicPath.endsWith("/") ? publicPath : `${publicPath}/`}${name}` };
        }

        // Otherwise let the bundler place the file and resolve the URL. Only it knows
        // where the importing chunk lands, and a chunk-relative literal breaks the
        // moment that chunk is nested in a subdirectory.
        const referenceId = context.emitFile({ name, source: bytes, type: "asset" });

        return { kind: "asset-reference", urlExpression: `import.meta.ROLLUP_FILE_URL_${referenceId}` };
    };

    /**
     * Top-level await is required to fetch an asset in a browser, and to compile anything
     * past the 4 KB synchronous limit there.
     */
    const needsTopLevelAwait = (bytes: Uint8Array, delivery: Delivery): boolean =>
        targetEnv === "browser" && (delivery.kind === "asset" || bytes.byteLength > BROWSER_SYNC_LIMIT);

    const usesTopLevelAwait = (bytes: Uint8Array, delivery: Delivery): boolean =>
        instantiation === "await" || (instantiation === "auto" && needsTopLevelAwait(bytes, delivery));

    /**
     * Returns the error to report when the module can only be loaded under top-level
     * await but the build cannot carry it, or `undefined` when there is no conflict.
     */
    const topLevelAwaitBlocker = (filePath: string, bytes: Uint8Array, delivery: Delivery): string | undefined => {
        if (topLevelAwait || !usesTopLevelAwait(bytes, delivery)) {
            return undefined;
        }

        if (instantiation === "await") {
            return `[packem:wasm] \`instantiation: "await"\` needs top-level await, which is not available because this build also emits CommonJS. Use "sync", or drop the CJS output.`;
        }

        const reason =
            delivery.kind === "asset"
                ? "it is emitted as a separate asset"
                : `${String(bytes.byteLength)} bytes exceeds the 4 KB synchronous compilation limit`;

        return `[packem:wasm] "${basename(filePath)}" cannot be loaded synchronously for the browser (${reason}), but this build also emits CommonJS, which cannot use top-level await. Emit ESM only, or set \`mode: "preserve"\`.`;
    };

    return {
        buildStart() {
            emissions.clear();
        },

        generateBundle() {
            // Only `publicPath` deliveries land here; the rest are emitted during `load`
            // so the bundler can resolve their URLs per importing chunk.
            for (const { fileName: name, source } of emissions.values()) {
                this.emitFile({ fileName: name, source, type: "asset" });
            }
        },

        async load(id) {
            const sourcePhasePath = decodeSourceId(id);
            const filePath = sourcePhasePath ?? id;

            // A `\0`-prefixed id that is not one of ours belongs to another plugin's
            // virtual module and must not be read from disk.
            if (sourcePhasePath === undefined && (id.startsWith("\0") || !filter(id))) {
                // eslint-disable-next-line unicorn/no-null
                return null;
            }

            const bytes = await readFile(filePath);

            this.addWatchFile(filePath);

            const form: Form = sourcePhasePath === undefined ? "instance" : "source";

            let shape = { exports: [], imports: [] } as ReturnType<typeof parseWasmModuleShape>;

            // The source phase never reads the module's shape — it hands back the
            // compiled module untouched — so a binary this reader cannot decode is only
            // fatal for the instance form, which needs the export names to emit bindings.
            if (form === "instance") {
                try {
                    shape = parseWasmModuleShape(bytes);
                } catch (error) {
                    if (error instanceof WasmParseError) {
                        this.error(`[packem:wasm] could not read "${filePath}": ${error.message}`);
                    }

                    throw error;
                }
            }

            const delivery = await resolveDelivery(this, filePath, bytes);

            const blocker = topLevelAwaitBlocker(filePath, bytes, delivery);

            if (blocker !== undefined) {
                this.error(blocker);
            }

            return generateWasmModule({
                await: usesTopLevelAwait(bytes, delivery),
                delivery,
                form,
                shape,
            });
        },

        name: "packem:wasm",

        async resolveId(source, importer) {
            if (source.startsWith(VIRTUAL_SOURCE_PREFIX)) {
                return source;
            }

            if (!source.endsWith(".wasm")) {
                // eslint-disable-next-line unicorn/no-null
                return null;
            }

            if (mode === "preserve") {
                // Keep the specifier exactly as written so the downstream consumer
                // resolves it the same way the source did.
                return { external: true, id: source };
            }

            const resolved = await this.resolve(source, importer, { skipSelf: true });

            if (resolved !== null) {
                return resolved.external ? resolved : resolved.id;
            }

            if (importer !== undefined && (source.startsWith("./") || source.startsWith("../"))) {
                return resolve(dirname(importer), source);
            }

            // eslint-disable-next-line unicorn/no-null
            return null;
        },

        async transform(code, id) {
            const baseId = id.split("?", 1)[0] ?? id;

            if (baseId.startsWith(VIRTUAL_SOURCE_PREFIX) || !SOURCE_FILE.test(baseId)) {
                // eslint-disable-next-line unicorn/no-null
                return null;
            }

            // `import source` is not yet parseable by the transformers packem drives
            // (esbuild, swc, oxc, sucrase) or by either bundler backend, so it has to be
            // rewritten to a plain default import before anything else sees the file.
            // This hook is registered ahead of the transformer adapter for that reason.
            if (!code.includes(".wasm") || !code.includes("source")) {
                // eslint-disable-next-line unicorn/no-null
                return null;
            }

            const rewrites: Promise<Splice>[] = [];

            for (const { binding, index: start, specifier, statement } of findSourcePhaseImports(code)) {
                if (!specifier.endsWith(".wasm")) {
                    continue;
                }

                if (mode === "preserve") {
                    // The specifier cannot be preserved here: `import source` is
                    // unparseable by every transformer packem drives, so it has to be
                    // rewritten away — exactly what preserve mode forbids. Failing
                    // loudly beats silently inlining the module instead.
                    this.error(
                        `[packem:wasm] \`mode: "preserve"\` cannot be combined with the source phase import of "${specifier}". Preserving the specifier would leave \`import source\` in the output, which no current transformer or bundler can parse. Use another mode, or import the module normally.`,
                    );
                }

                rewrites.push(
                    (async () => {
                        const resolved = await this.resolve(specifier, id, { skipSelf: true });
                        const filePath = resolved?.id ?? resolve(dirname(id), specifier);

                        return { end: start + statement.length, start, text: `import ${binding} from ${JSON.stringify(encodeSourceId(filePath))}` };
                    })(),
                );
            }

            if (rewrites.length === 0) {
                // eslint-disable-next-line unicorn/no-null
                return null;
            }

            const splices = await Promise.all(rewrites);

            let rewritten = code;

            // The scanner returns declarations in source order, so applying them back to
            // front keeps every offset ahead of the cursor valid. Splicing by offset also
            // means two identical declarations in one file are rewritten independently,
            // and an identical run of text elsewhere is left alone.
            for (const { end, start, text } of splices.toReversed()) {
                rewritten = rewritten.slice(0, start) + text + rewritten.slice(end);
            }

            // eslint-disable-next-line unicorn/no-null
            return { code: rewritten, map: null };
        },
    };
};

export type { WasmExport, WasmExternalKind, WasmImport, WasmModuleShape } from "./parse";
export type { WasmDeliveryMode, WasmInstantiation, WasmPluginOptions };
export { wasmPlugin };
export default wasmPlugin;
