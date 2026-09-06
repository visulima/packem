import type { WasmModuleShape } from "./parse";

/** How the wrapper obtains the module bytes at runtime. */
type Delivery =
    | { base64: string; kind: "inline" }
    /** A literal URL, relative to the chunk, used when `publicPath` pins the location. */
    | { kind: "asset"; url: string }

    /**
     * An expression the bundler rewrites into the emitted file's URL. Preferred over a
     * literal, because only the bundler knows where the importing chunk ends up: a
     * chunk-relative `./name.wasm` breaks as soon as that chunk is nested.
     */
    | { kind: "asset-reference"; urlExpression: string };

/** Which shape of module the importer asked for. */
type Form = "instance" | "source";

interface CodegenOptions {
    /**
     * `true` to compile (and instantiate) with top-level `await`, `false` to use the
     * synchronous `WebAssembly.Module`/`Instance` constructors. Top-level await keeps
     * large modules working on a browser main thread, where synchronous compilation is
     * capped at 4 KB, but is only available in ESM output.
     */
    await: boolean;
    delivery: Delivery;
    form: Form;
    /** The importer's path, used only to make generated identifiers readable. */
    shape: WasmModuleShape;
}

/**
 * WebAssembly export names are arbitrary UTF-8 and routinely contain characters that are
 * not valid in a JavaScript identifier (`memory.grow`, `wbg_$1`, or a name that collides
 * with a keyword). Names that are already valid identifiers are exported directly;
 * everything else goes through an `export { local as "the name" }` alias, which accepts
 * any string.
 */
const IDENTIFIER = /^[$A-Z_][\w$]*$/i;

const RESERVED = new Set([
    "await",
    "break",
    "case",
    "catch",
    "class",
    "const",
    "continue",
    "debugger",
    "default",
    "delete",
    "do",
    "else",
    "enum",
    "export",
    "extends",
    "false",
    "finally",
    "for",
    "function",
    "if",
    "implements",
    "import",
    "in",
    "instanceof",
    "interface",
    "let",
    "new",
    "null",
    "package",
    "private",
    "protected",
    "public",
    "return",
    "static",
    "super",
    "switch",
    "this",
    "throw",
    "true",
    "try",
    "typeof",
    "var",
    "void",
    "while",
    "with",
    "yield",
]);

const isPlainIdentifier = (name: string): boolean => IDENTIFIER.test(name) && !RESERVED.has(name);

/**
 * Emits the statements that leave the module's bytes in a `__packem_wasm_bytes` binding.
 *
 * Inline delivery decodes a base64 literal, which works identically in every runtime and
 * keeps the module self-contained. Asset delivery reads the emitted file next to the
 * chunk: `fetch` under top-level await (the only form that works in a browser), and
 * `node:fs` otherwise, which also keeps CJS output working since there is no `await` to
 * transpile away.
 */
const emitBytes = (delivery: Delivery, useAwait: boolean): string => {
    if (delivery.kind === "inline") {
        // `Uint8Array.fromBase64` is still too new to rely on, and `atob` is absent from
        // older Node; `Buffer` is absent from browsers. Decode through whichever exists.
        return `const __packem_wasm_bytes = (() => {
  const base64 = "${delivery.base64}";

  if (typeof Buffer === "function" && typeof Buffer.from === "function") {
    return Buffer.from(base64, "base64");
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
})();`;
    }

    // A literal URL is resolved against the chunk; a reference is already an absolute
    // URL expression the bundler substitutes.
    const url = delivery.kind === "asset-reference" ? delivery.urlExpression : `new URL(${JSON.stringify(delivery.url)}, import.meta.url)`;

    if (useAwait) {
        // `fetch` accepts a URL or its string form, so either delivery works as-is.
        return `const __packem_wasm_bytes = new Uint8Array(await (await fetch(${url})).arrayBuffer());`;
    }

    // `readFileSync` accepts a path or a URL object, but not a `file://` string — and the
    // bundler expands a file reference to exactly that. Normalising through `new URL`
    // covers both deliveries.
    return `import { readFileSync as __packem_wasm_read } from "node:fs";

const __packem_wasm_bytes = __packem_wasm_read(new URL(${url}));`;
};

/**
 * Builds the import object for a module that declares WebAssembly imports.
 *
 * Under the [ESM integration proposal](https://github.com/WebAssembly/esm-integration) a
 * wasm import's module name is an ES module specifier, so each distinct one becomes a
 * namespace import on the wrapper and the bundler resolves it like any other dependency.
 */
const emitImportObject = (shape: WasmModuleShape): { declarations: string; expression: string } => {
    if (shape.imports.length === 0) {
        return { declarations: "", expression: "{}" };
    }

    const specifiers = [...new Set(shape.imports.map((entry) => entry.module))];
    const namespaces = new Map(specifiers.map((specifier, index) => [specifier, `__packem_wasm_import_${String(index)}`]));

    const declarations = specifiers.map((specifier) => `import * as ${namespaces.get(specifier) as string} from ${JSON.stringify(specifier)};`).join("\n");

    const expression = `{
${specifiers.map((specifier) => `  [${JSON.stringify(specifier)}]: ${namespaces.get(specifier) as string},`).join("\n")}
}`;

    return { declarations, expression };
};

/**
 * Generates the JavaScript wrapper that stands in for a `.wasm` file in the module graph.
 * @param options How the bytes are delivered, which import form was used, and the module's declared shape.
 * @param options.await Whether to compile and instantiate under top-level `await`.
 * @param options.delivery Where the wrapper reads the module's bytes from.
 * @param options.form Which import form the wrapper has to satisfy.
 * @param options.shape The module's declared imports and exports.
 * @returns The wrapper module's source.
 */
const generateWasmModule = ({ await: useAwait, delivery, form, shape }: CodegenOptions): string => {
    const bytes = emitBytes(delivery, useAwait);

    if (form === "source") {
        // The source phase yields the compiled-but-not-instantiated module, so the
        // wrapper stops at compilation and never touches the import object.
        const compiled = useAwait ? `await WebAssembly.compile(__packem_wasm_bytes)` : `new WebAssembly.Module(__packem_wasm_bytes)`;

        return `${bytes}

const __packem_wasm_module = ${compiled};

export default __packem_wasm_module;
`;
    }

    const { declarations, expression } = emitImportObject(shape);

    const instantiated = useAwait
        ? `(await WebAssembly.instantiate(__packem_wasm_bytes, __packem_wasm_imports)).instance`
        : `new WebAssembly.Instance(new WebAssembly.Module(__packem_wasm_bytes), __packem_wasm_imports)`;

    const named: string[] = [];
    const aliased: string[] = [];

    shape.exports.forEach((entry, index) => {
        if (isPlainIdentifier(entry.name)) {
            named.push(`export const ${entry.name} = __packem_wasm_exports[${JSON.stringify(entry.name)}];`);

            return;
        }

        const local = `__packem_wasm_export_${String(index)}`;

        aliased.push(`const ${local} = __packem_wasm_exports[${JSON.stringify(entry.name)}];`, `export { ${local} as ${JSON.stringify(entry.name)} };`);
    });

    return `${declarations === "" ? "" : `${declarations}\n\n`}${bytes}

const __packem_wasm_imports = ${expression};
const __packem_wasm_instance = ${instantiated};
const __packem_wasm_exports = __packem_wasm_instance.exports;

${[...named, ...aliased].join("\n")}

// Preserves the default export of \`@rollup/plugin-wasm\`, whose init function resolves to
// a \`WebAssembly.Instance\`. Passing an import object re-instantiates the module; calling
// it bare hands back the instance the named exports come from.
export default (imports) => Promise.resolve(
  imports === undefined
    ? __packem_wasm_instance
    : new WebAssembly.Instance(new WebAssembly.Module(__packem_wasm_bytes), imports),
);
`;
};

export type { CodegenOptions, Delivery, Form };
export { generateWasmModule };
