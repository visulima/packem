/**
 * Raised when a file cannot be read as a WebAssembly binary — it is not one, its version
 * is unsupported, or it is truncated or otherwise malformed.
 */
class WasmParseError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = "WasmParseError";
    }
}

export default WasmParseError;
