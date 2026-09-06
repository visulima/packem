import WasmParseError from "./parse-error";

/**
 * A minimal WebAssembly binary reader.
 *
 * Only the two sections needed to wire a `.wasm` module into the ES module graph are
 * decoded: the import section (id 2), whose module specifiers become the wrapper's own
 * `import` statements, and the export section (id 7), whose names become the wrapper's
 * named exports. Everything else is skipped by its declared length, so the reader stays
 * independent of the rest of the binary format and of any post-MVP proposal that adds
 * sections or extends the ones it does not read.
 */

const WASM_MAGIC = 0x00_61_73_6d;
const WASM_SUPPORTED_VERSION = 1;

const SECTION_IMPORT = 2;
const SECTION_EXPORT = 7;

/** External kinds, shared by the import and export sections. */
const KINDS = ["function", "table", "memory", "global", "tag"] as const;

type WasmExternalKind = (typeof KINDS)[number];

interface WasmExport {
    kind: WasmExternalKind;
    name: string;
}

interface WasmImport {
    kind: WasmExternalKind;
    /** The import's module specifier, e.g. `./util.js`. */
    module: string;
    /** The imported field on `module`, e.g. `log` in `(import "./util.js" "log" ...)`. */
    name: string;
}

interface WasmModuleShape {
    exports: WasmExport[];
    imports: WasmImport[];
}

/** Continuation-bit mask for LEB128, and the payload mask for the remaining seven bits. */
const LEB_CONTINUATION = 0x80;
const LEB_PAYLOAD = 0x7f;

/** Set in a limits header when a maximum follows the minimum. */
const LIMITS_HAS_MAXIMUM = 0x01;

/**
 * A cursor over the module bytes. Every read is bounds-checked so a truncated or
 * malformed binary surfaces as a `WasmParseError` naming the offset rather than as an
 * out-of-range read that silently yields `undefined`.
 */
class Reader {
    readonly #bytes: Uint8Array;

    #offset = 0;

    public constructor(bytes: Uint8Array) {
        this.#bytes = bytes;
    }

    public get offset(): number {
        return this.#offset;
    }

    public get exhausted(): boolean {
        return this.#offset >= this.#bytes.length;
    }

    public u8(): number {
        if (this.#offset >= this.#bytes.length) {
            throw new WasmParseError(`unexpected end of binary at offset ${String(this.#offset)}`);
        }

        const value = this.#bytes[this.#offset] as number;

        this.#offset += 1;

        return value;
    }

    /** Unsigned LEB128, as used for every length and index in the binary format. */
    public varUint32(): number {
        let result = 0;
        let shift = 0;

        for (;;) {
            const byte = this.u8();

            // eslint-disable-next-line no-bitwise -- LEB128 is defined in terms of the low seven bits and a continuation flag
            result += (byte & LEB_PAYLOAD) * 2 ** shift;

            // eslint-disable-next-line no-bitwise -- see above
            if ((byte & LEB_CONTINUATION) === 0) {
                // The fifth byte of a u32 carries only four payload bits. Anything above
                // that encodes a value past 2^32-1, which no index or length may be.
                if (shift === 28 && byte > 0x0f) {
                    throw new WasmParseError(`LEB128 integer exceeds the u32 range at offset ${String(this.#offset)}`);
                }

                break;
            }

            shift += 7;

            // A u32 never needs more than five LEB128 bytes; more means the binary is
            // malformed (or hostile), and continuing would loop until the buffer ends.
            if (shift > 28) {
                throw new WasmParseError(`malformed LEB128 integer at offset ${String(this.#offset)}`);
            }
        }

        return result;
    }

    public skip(length: number): void {
        if (length < 0 || this.#offset + length > this.#bytes.length) {
            throw new WasmParseError(`section length ${String(length)} runs past the end of the binary at offset ${String(this.#offset)}`);
        }

        this.#offset += length;
    }

    /** A length-prefixed UTF-8 name. */
    public name(): string {
        const length = this.varUint32();

        if (this.#offset + length > this.#bytes.length) {
            throw new WasmParseError(`name of length ${String(length)} runs past the end of the binary at offset ${String(this.#offset)}`);
        }

        // `fatal` turns malformed UTF-8 into an error rather than U+FFFD, and `ignoreBOM`
        // keeps a leading U+FEFF: the binary format treats a name as an arbitrary UTF-8
        // string, so a BOM there is part of the name, not an encoding marker.
        let value: string;

        try {
            value = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(this.#bytes.subarray(this.#offset, this.#offset + length));
        } catch {
            throw new WasmParseError(`malformed UTF-8 name at offset ${String(this.#offset)}`);
        }

        this.#offset += length;

        return value;
    }

    public kind(): WasmExternalKind {
        const raw = this.u8();
        const kind = KINDS[raw];

        if (kind === undefined) {
            throw new WasmParseError(`unknown external kind ${String(raw)} at offset ${String(this.#offset - 1)}`);
        }

        return kind;
    }
}

/** Consumes a limits header, which is a flags byte, a minimum, and an optional maximum. */
const skipLimits = (reader: Reader): void => {
    const flags = reader.varUint32();

    reader.varUint32();

    // eslint-disable-next-line no-bitwise -- the limits header is a bit flag by definition
    if ((flags & LIMITS_HAS_MAXIMUM) !== 0) {
        reader.varUint32();
    }
};

/**
 * Skips an import descriptor, whose shape depends on the kind that precedes it. Only the
 * module/field names matter to the wrapper, but the descriptor still has to be consumed
 * to reach the next entry.
 */
const skipImportDescriptor = (reader: Reader, kind: WasmExternalKind): void => {
    switch (kind) {
        case "function": {
            reader.varUint32(); // type index

            break;
        }
        case "global": {
            reader.u8(); // value type
            reader.u8(); // mutability

            break;
        }
        case "memory": {
            skipLimits(reader);

            break;
        }
        case "table": {
            reader.u8(); // element type
            skipLimits(reader);

            break;
        }
        case "tag": {
            reader.u8(); // attribute
            reader.varUint32(); // type index

            break;
        }
        default: {
            throw new WasmParseError(`unhandled import kind ${String(kind)}`);
        }
    }
};

/**
 * Reads the imports and exports declared by a WebAssembly binary.
 * @param bytes The raw contents of a `.wasm` file.
 * @returns The module's declared imports and exports, in binary order.
 * @throws {WasmParseError} If the bytes are not a WebAssembly binary of a supported version, or are truncated.
 */
const parseWasmModuleShape = (bytes: Uint8Array): WasmModuleShape => {
    if (bytes.length < 8) {
        throw new WasmParseError("file is too short to be a WebAssembly binary");
    }

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    if (view.getUint32(0, false) !== WASM_MAGIC) {
        throw new WasmParseError(String.raw`file does not start with the WebAssembly magic number (\0asm)`);
    }

    const version = view.getUint32(4, true);

    if (version !== WASM_SUPPORTED_VERSION) {
        throw new WasmParseError(`unsupported WebAssembly binary version ${String(version)}`);
    }

    const reader = new Reader(bytes);

    reader.skip(8);

    // Named `moduleExports`/`moduleImports` rather than the obvious `exports`/`imports`:
    // the latter shadow the CommonJS globals and read as a module system escape.
    const moduleExports: WasmExport[] = [];
    const moduleImports: WasmImport[] = [];

    while (!reader.exhausted) {
        const id = reader.u8();
        const size = reader.varUint32();
        const end = reader.offset + size;

        if (id === SECTION_IMPORT) {
            const count = reader.varUint32();

            for (let index = 0; index < count; index += 1) {
                const module = reader.name();
                const name = reader.name();
                const kind = reader.kind();

                skipImportDescriptor(reader, kind);

                moduleImports.push({ kind, module, name });
            }
        } else if (id === SECTION_EXPORT) {
            const count = reader.varUint32();

            for (let index = 0; index < count; index += 1) {
                const name = reader.name();
                const kind = reader.kind();

                reader.varUint32(); // exported item index

                moduleExports.push({ kind, name });
            }
        }

        // Re-sync on the section's declared length. This both skips the sections we do
        // not decode and absorbs any trailing bytes in the ones we do — a forward
        // compatible descriptor gains fields without breaking the walk.
        reader.skip(end - reader.offset);
    }

    return { exports: moduleExports, imports: moduleImports };
};

export type { WasmExport, WasmExternalKind, WasmImport, WasmModuleShape };
export { parseWasmModuleShape };
export { default as WasmParseError } from "./parse-error";
