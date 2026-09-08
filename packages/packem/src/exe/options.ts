import type { ChecksumAlgorithm } from "./checksum";
import type { CompressionAlgorithm } from "./compress";
import type { FileNameTokens } from "./file-name";
import type { ExeExtensionOptions } from "./platform";

export interface ExeChunk {
    path: string;
    type?: string;
}

export interface SeaConfig {
    /** Optional, embedded asset mappings. */
    assets?: Record<string, string>;
    /** @default true */
    disableExperimentalSEAWarning?: boolean;
    /** Extra Node.js CLI arguments embedded into the executable. */
    execArgv?: string[];
    /** @default "env" */
    execArgvExtension?: "cli" | "env" | "none";
    /** Optional; if not specified, uses the current Node.js binary. */
    executable?: string;
    main?: string;
    mainFormat?: "commonjs" | "module";
    output?: string;
    /** @default false */
    useCodeCache?: boolean;
    /** @default false */
    useSnapshot?: boolean;
}

/**
 * Files embedded into the executable and read back at runtime.
 *
 * Provide glob patterns (`!`-prefixed entries exclude), or an explicit map of runtime
 * key to file path when you want to control the keys yourself.
 * @example
 * ```ts
 * // Globs — keys are the paths relative to the project root.
 * assets: ["templates/**\/*.hbs", "locales/*.json", "!locales/_draft.json"]
 *
 * // Explicit keys.
 * assets: { "schema.json": "./src/schema.json" }
 * ```
 */
export type ExeAssets = Record<string, string> | string[] | string;

/** macOS `codesign` configuration. */
export interface ExeSignOptions {
    /** Extra arguments appended to the `codesign` invocation, such as `--timestamp`. */
    args?: string[];
    /** Path to a plist granting the executable extra macOS capabilities, resolved relative to the project root. */
    entitlements?: string;

    /**
     * Signing identity, defaulting to `"-"`. Ad-hoc signing with `"-"` is enough to
     * satisfy the Apple silicon loader, but not Gatekeeper on a downloaded file — pass a
     * Developer ID identity for a binary you distribute.
     */
    identity?: string;
}

/** Fields written into the Windows PE version resource. */
export interface ExeVersionInfo {
    /** @default the `author` field of package.json */
    companyName?: string;
    /** @default the `description` field of package.json */
    fileDescription?: string;
    /** @default the `version` field of package.json */
    fileVersion?: string;
    /** @default the `name` field of package.json */
    internalName?: string;
    legalCopyright?: string;
    /** @default the generated executable file name */
    originalFilename?: string;
    /** @default the `name` field of package.json */
    productName?: string;
    /** @default the `version` field of package.json */
    productVersion?: string;
}

/**
 * Windows-only branding applied to the base `node.exe` before the code is injected.
 *
 * Requires the optional `resedit` package.
 */
export interface ExeWindowsOptions {
    /** Path to a `.ico` file, resolved relative to the project root. */
    icon?: string;

    /**
     * Version information shown in the file properties dialog.
     * Set to `true` to derive every field from `package.json`.
     */
    versionInfo?: ExeVersionInfo | boolean;
}

/** macOS-only options. */
export interface ExeMacosOptions {
    /**
     * Code-sign the executable with `codesign` after the code is injected.
     * Injection invalidates the signature Node.js ships with, so this defaults to
     * ad-hoc signing — required for the binary to start at all on Apple silicon.
     * @default true
     */
    sign?: ExeSignOptions | boolean;
}

export interface ExeOptions extends ExeExtensionOptions {
    /**
     * Files embedded into the executable, readable at runtime through
     * `@visulima/packem/sea` or Node's own `node:sea` module.
     * @see {@link ExeAssets}
     */
    assets?: ExeAssets;

    /**
     * Ship the entry as a V8 code cache instead of readable JavaScript.
     *
     * The bundle is compiled ahead of time and only the resulting bytecode is embedded,
     * so the executable carries no source text. This is `pkg`'s bytecode mode.
     *
     * Two constraints come from V8 itself:
     *
     * - The entry must be CommonJS, since the code cache is reached through `vm.Script`.
     * - A code cache is only valid for the exact Node.js build that produced it, so the
     * target has to be one this machine can run. Cross-platform targets are rejected, and
     * have to be built on a matching machine.
     *
     * Function names and string literals survive in the cache, so treat this as raising
     * the cost of reading your code, not as encryption.
     * @default false
     */
    bytecode?: boolean;

    /**
     * Write a `&lt;file>.sha256` (or `.sha512`) digest next to every executable, in the
     * `coreutils` format so `sha256sum -c` can verify it.
     * @default false
     */
    checksum?: ChecksumAlgorithm | boolean;

    /**
     * Embed a V8 code cache so the executable skips parsing on startup.
     * Costs binary size and requires the build host and target to match.
     * @default false
     */
    codeCache?: boolean;

    /**
     * Compress the embedded payload — assets, and the bytecode when `bytecode` is on.
     *
     * `true` selects brotli. The base Node.js runtime cannot be compressed, so this
     * shrinks your payload rather than the whole executable.
     * @default false
     */
    compress?: CompressionAlgorithm | boolean;

    /**
     * Restrict which build entries become executables, matched against the entry's
     * output file name or its `name`. By default every non-declaration entry chunk
     * produces an executable.
     * @example ```ts
     * entries: ["cli"]
     * ```
     */
    entries?: string[];

    /**
     * Node.js CLI arguments baked into the executable, the equivalent of `pkg --options`.
     * @example ```ts
     * execArgv: ["--max-old-space-size=4096", "--enable-source-maps"]
     * ```
     */
    execArgv?: string[];

    /**
     * Output file name, without an extension. Supports the tokens `[name]`,
     * `[platform]`, `[arch]`, `[node]` and `[version]`.
     *
     * Defaults to `[name]` for a single executable and `[name]-[platform]-[arch]` when
     * several are produced. `.exe` is appended automatically for Windows targets.
     */
    fileName?: ((chunk: FileNameTokens & { path: string }) => string) | string;

    /** macOS-specific options. */
    macos?: ExeMacosOptions;

    /**
     * Embed the `.node` addons the build produced and write them out at runtime.
     *
     * A native addon is a compiled shared library that the dynamic linker has to load from
     * a real path, so an embedded copy cannot be loaded in place. packem prefixes the entry
     * with code that materializes each addon on first use into a content-hashed directory
     * under the system temporary directory, overridable at runtime with
     * `PACKEM_SEA_NATIVES_DIR`.
     *
     * Because an addon is built for one platform and architecture, this only works for a
     * target the build machine matches; other targets are rejected.
     *
     * Set to `false` to leave the addons in the output directory instead, which means
     * shipping them next to the executable rather than a single file.
     * @default true
     */
    nativeModules?: boolean;

    /**
     * Node.js version used for targets that do not name one themselves.
     * Accepts an exact version (`"25.7.0"`), a major or minor (`"25"`, `"25.7"`), or
     * `"latest"` / `"latest-lts"`.
     * @default the Node.js version running the build
     */
    nodeVersion?: string;

    /**
     * Output directory for executables, relative to the project root.
     * @default "build"
     */
    outDir?: string;

    /**
     * Node.js SEA configuration passthrough, for options without a dedicated field.
     * Dedicated fields (`assets`, `codeCache`, `execArgv`, `snapshot`) win over it.
     * @see https://nodejs.org/api/single-executable-applications.html#generating-single-executable-applications-with---build-sea
     */
    seaConfig?: Omit<SeaConfig, "main" | "mainFormat" | "output">;

    /**
     * Build the executable from a V8 startup snapshot. Cuts startup time further than
     * `codeCache`, but the entry must be snapshot-safe (no I/O or timers at module scope).
     * @default false
     */
    snapshot?: boolean;

    /** Windows-specific options. */
    windows?: ExeWindowsOptions;
}
