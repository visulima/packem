# Building standalone executables

packem can ship your bundle as a single file that runs on machines without Node.js installed — the
same job [`pkg`](https://github.com/yao-pkg/pkg) does, built on Node.js'
[Single Executable Applications](https://nodejs.org/api/single-executable-applications.html) support
instead of a patched runtime.

> [!IMPORTANT]
> The `exe` option needs **Node.js >= 25.7.0 on the build machine**, which is where stable
> `--build-sea` landed. It is not supported under Bun or Deno. The feature is experimental and its
> options may change.

## Quick start

```ts
// packem.config.ts
import { defineConfig } from "@visulima/packem/config";

export default defineConfig({
    exe: true,
    runtime: "node",
});
```

```sh
packem build
# build/cli
```

Or without touching the config at all:

```sh
packem build --exe
```

Every entry your build produces (except declaration files) becomes an executable in `build/`.

## Cross-compiling

`targets` accepts `pkg`-style strings. Anything you leave out falls back to the build host, and the
parts may appear in any order, so `linux-node25-x64` and `node25-linux-x64` are the same target.

```ts
exe: {
    targets: ["host", "linux-x64", "linux-arm64", "darwin-arm64", "win-x64"],
}
```

| Form                   | Meaning                                                       |
| ---------------------- | ------------------------------------------------------------- |
| `host`                 | The machine running the build — reuses the running `node`.    |
| `linux`                | Platform only; architecture and version default to the host.  |
| `darwin-arm64`         | Platform and architecture.                                    |
| `node25-win-x64`       | Node.js major, resolved to the newest matching release.       |
| `node25.7.0-linux-x64` | An exact Node.js release.                                     |
| `lts-linux-x64`        | Newest LTS release. `latest` and `current` work the same way. |

Platform aliases: `darwin`/`mac`/`macos`/`osx`, `win`/`win32`/`windows`, `linux`.
Architecture aliases: `x64`/`amd64`/`x86_64`, `arm64`/`aarch64`.

Non-host targets download the matching official Node.js binary from `nodejs.org`, verify it against
the published `SHASUMS256.txt`, and cache it (`~/.cache/packem` on Linux, `~/Library/Caches/packem`
on macOS, `%LOCALAPPDATA%\packem\Caches` on Windows), so only the first build pays for the download.

The object form is still available when you want it:

```ts
exe: {
    targets: [{ arch: "arm64", nodeVersion: "latest-lts", platform: "darwin" }],
}
```

## Embedding assets

This is `pkg`'s snapshot filesystem: files your program reads at runtime, carried inside the binary.

```ts
exe: {
    assets: ["templates/**/*.hbs", "locales/*.json", "!locales/_draft.json"],
}
```

Keys are the paths relative to the project root, always forward-slashed, so the key is the same
string you would have passed to `readFile`. An explicit map works too when you want to pick the keys
yourself:

```ts
exe: {
    assets: { "schema.json": "./src/generated/schema.json" },
}
```

Read them back with the runtime helper:

```ts
import { getAssetJson, getAssetText } from "@visulima/packem/sea";

const template = await getAssetText("templates/mail.hbs");
const schema = await getAssetJson("schema.json");
```

The helper works in both worlds. Inside the executable it reads the embedded copy; during ordinary
`node dist/cli.js` development it falls back to the file on disk, so you never need an
`if (isSea())` branch. The fallback root is `process.cwd()`, overridable with the
`PACKEM_SEA_ASSET_ROOT` environment variable or `setAssetRoot()`.

Also exported: `getAsset` (`ArrayBuffer`), `getAssetBuffer`, `getAssetBlob`, `isSea`, `getAssetRoot`.

## Output naming

```ts
exe: {
    fileName: "[name]-[version]-[platform]-[arch]",
    outDir: "dist/bin",
}
```

Tokens: `[name]` (the entry's base name), `[platform]`, `[arch]`, `[node]` (the exact Node.js
version), `[version]` (your `package.json` version). `.exe` is appended for Windows targets.

Without a `fileName`, packem uses `[name]` for a single executable and
`[name]-[platform]-[arch]` when a build produces several, so files never overwrite each other. A
literal name (no tokens) still gets a platform suffix in a multi-target build.

`fileName` can also be a function, receiving the tokens plus the chunk `path`.

## Windows icon and version information

```ts
exe: {
    targets: ["win-x64"],
    windows: {
        icon: "./assets/app.ico",
        versionInfo: true,
    },
}
```

`versionInfo: true` fills every field from `package.json` (`name`, `version`, `description`,
`author`); pass an object to override any of `companyName`, `fileDescription`, `fileVersion`,
`internalName`, `legalCopyright`, `originalFilename`, `productName`, `productVersion`.

The resources are written into the base `node.exe` **before** the code is injected — rewriting the
PE afterwards would relocate the sections the injected blob lives in.

This needs the optional [`resedit`](https://github.com/jet2jet/resedit-js) package:

```sh
npm install --save-dev resedit
```

## macOS code signing

Injecting code invalidates the signature Node.js ships with, and unsigned binaries are killed on
sight on Apple silicon, so darwin targets are **ad-hoc signed by default**. Nothing to configure for
local use.

```ts
exe: {
    macos: {
        sign: {
            entitlements: "./build/app.entitlements",
            identity: "Developer ID Application: Acme Inc. (ABCDE12345)",
        },
    },
}
```

Set `macos: { sign: false }` to skip it. Signing needs the Apple toolchain, so cross-building a
darwin executable from Linux or Windows warns and emits an unsigned binary rather than failing —
re-sign it on a macOS machine before distributing.

Windows Authenticode signing is not built in; sign the produced `.exe` with `signtool` or
`AzureSignTool` in CI.

## Startup performance

```ts
exe: {
    codeCache: true, // embed a V8 code cache — skips parsing on startup
    snapshot: false, // build from a V8 startup snapshot — faster still, but the entry must be snapshot-safe
}
```

`codeCache` requires the build host and the target to match. `snapshot` requires an entry that does
no I/O and starts no timers at module scope.

## Baking in Node.js flags

The equivalent of `pkg --options`:

```ts
exe: {
    execArgv: ["--max-old-space-size=4096", "--enable-source-maps"],
}
```

## Checksums

```ts
exe: {
    checksum: true, // or "sha512"
}
```

Writes `build/cli.sha256` next to each executable in the `coreutils` format, so
`sha256sum -c build/cli.sha256` verifies it with no extra tooling.

## Picking which entries become executables

By default every entry chunk produces an executable. To build only some of them:

```ts
exe: {
    entries: ["cli"],
}
```

Names are matched against the output file name with or without its extension.

## Escape hatch

Anything without a dedicated option can be passed straight through to the SEA config. Dedicated
fields win over it.

```ts
exe: {
    seaConfig: {
        execArgvExtension: "cli",
    },
}
```

## CLI flags

Every flag maps onto the option of the same name and overrides the config file.

| Flag                 | Option         |
| -------------------- | -------------- |
| `--exe`              | enable         |
| `--exe-target`       | `targets`      |
| `--exe-out-dir`      | `outDir`       |
| `--exe-name`         | `fileName`     |
| `--exe-asset`        | `assets`       |
| `--exe-node-version` | `nodeVersion`  |
| `--exe-checksum`     | `checksum`     |
| `--exe-code-cache`   | `codeCache`    |
| `--exe-icon`         | `windows.icon` |

```sh
packem build --exe --exe-target host,linux-x64,win-x64 --exe-checksum sha256
```

## Debugging

```sh
NODE_DEBUG=packem:exe packem build --exe
```

Logs every resolved target, download, asset and `sea-config.json`, and keeps the temporary build
directory around for inspection.

## Differences from `pkg`

|                          | packem `exe`                               | `pkg`                                |
| ------------------------ | ------------------------------------------ | ------------------------------------ |
| Runtime                  | Official Node.js builds + SEA              | Patched Node.js builds               |
| Build host               | Node.js >= 25.7.0                          | Node.js >= 16                        |
| Target Node.js           | >= 25.7.0                                  | 12 – 24                              |
| Assets                   | `assets` globs + `@visulima/packem/sea`    | `assets` globs + snapshot filesystem |
| Bytecode / source hiding | Not available                              | `--no-bytecode` / `--public`         |
| Payload compression      | Not available                              | `--compress GZip\|Brotli\|Zstd`      |
| Native addons (`.node`)  | Must stay external, next to the executable | Extracted at runtime                 |

The last three rows are the real gaps. SEA has no bytecode-only mode, so your bundled source is
readable inside the binary — do not rely on it to hide code. It also has no payload compression, so
executables are roughly `node` plus your bundle plus your assets.
