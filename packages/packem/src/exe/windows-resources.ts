import { Buffer } from "node:buffer";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { isAccessible } from "@visulima/fs";
import { extname, join, resolve } from "@visulima/path";

import { createDebug } from "./debug";
import type { ExeVersionInfo, ExeWindowsOptions } from "./options";

const debug = createDebug();

/** `resedit` is optional: only Windows icon/version-info builds need it. */
const RESEDIT_PACKAGE = "resedit";

/** US English — the language `node.exe` itself ships its resources under. */
const LANGUAGE_ID = 1033;

/** UTF-16LE, the code page every modern PE version resource uses. */
const CODE_PAGE = 1200;

interface ReseditIconFile {
    icons: { data: unknown }[];
}

interface ReseditVersionInfo {
    outputToResourceEntries: (entries: unknown[]) => void;
    setFileVersion: (major: number, minor: number, patch: number, build: number, language?: number) => void;
    setProductVersion: (major: number, minor: number, patch: number, build: number, language?: number) => void;
    setStringValues: (language: { codepage: number; lang: number }, values: Record<string, string>) => void;
}

interface ReseditExecutable {
    generate: () => ArrayBuffer;
}

interface ReseditResource {
    entries: unknown[];
    outputResource: (executable: ReseditExecutable) => void;
}

interface ReseditModule {
    Data: { IconFile: { from: (buffer: Buffer) => ReseditIconFile } };
    NtExecutable: { from: (buffer: Buffer) => Promise<ReseditExecutable> | ReseditExecutable };
    NtExecutableResource: { from: (executable: ReseditExecutable) => ReseditResource };
    Resource: {
        IconGroupEntry: { replaceIconsForResource: (entries: unknown[], iconGroupId: number, language: number, icons: unknown[]) => void };
        VersionInfo: { createEmpty: () => ReseditVersionInfo; fromEntries: (entries: unknown[]) => (ReseditVersionInfo | undefined)[] };
    };
}

/**
 * Loads the optional `resedit` dependency.
 *
 * `require` is used rather than a dynamic `import`, for the same reason as in
 * `ensure-installed`: a dynamic import with a variable specifier is rejected by
 * `@rollup/plugin-dynamic-import-vars` during packem's own build, while `require` is
 * invisible to that static analysis. The `exe` feature already requires Node.js >= 25.7,
 * where `require()` of an ESM package works, so either module format resolves.
 * @returns The `resedit` module.
 * @throws A message telling the user exactly what to install when it is missing.
 */
const loadResedit = (): ReseditModule => {
    try {
        const loaded: unknown = createRequire(import.meta.url)(RESEDIT_PACKAGE);

        return loaded as ReseditModule;
    } catch {
        throw new Error(
            `\`exe.windows.icon\` and \`exe.windows.versionInfo\` need the optional "resedit" package.\nInstall it with:\n  npm install --save-dev resedit`,
        );
    }
};

// Leading `major[.minor[.patch]]`, ignoring any prerelease or build metadata that follows.
const VERSION_QUAD = /^\D*(\d+)(?:\.(\d+))?(?:\.(\d+))?/;

/**
 * Splits a semver-ish string into the four numeric fields a PE version resource needs.
 * @param version The version string, e.g. `"2.1.0"` or `"2.1.0-beta.3"`.
 * @returns `[major, minor, patch, build]`, defaulting to zeroes for anything unparsable.
 */
const toVersionQuad = (version: string | undefined): [number, number, number, number] => {
    const match = version === undefined ? undefined : VERSION_QUAD.exec(version);

    if (!match) {
        return [0, 0, 0, 0];
    }

    // `minor` and `patch` are optional groups, so they are absent for a version like `"2"`.
    const toNumber = (value: string | undefined): number => (value === undefined ? 0 : Number(value));

    return [toNumber(match[1]), toNumber(match[2]), toNumber(match[3]), 0];
};

/** The subset of `package.json` the `exe` build reads. */
interface PackageMetadata {
    author?: { name?: string } | string;
    description?: string;
    name?: string;
    /** Decides whether an extensionless bundle is loaded as CommonJS or ESM. */
    type?: string;
    version?: string;
}

const readAuthorName = (author: PackageMetadata["author"]): string | undefined => {
    if (typeof author === "string") {
        return author;
    }

    return author?.name;
};

/**
 * Fills in the version-info fields the user did not set from the project's `package.json`.
 *
 * This is what makes `windows: { versionInfo: true }` produce a properly branded binary
 * without any extra configuration.
 * @param versionInfo The explicitly configured fields, if any.
 * @param packageJson The project's `package.json` contents.
 * @param outputFileName The final executable file name, used for `OriginalFilename`.
 * @returns The merged string values written into the PE resource.
 */
const buildVersionStrings = (versionInfo: ExeVersionInfo, packageJson: PackageMetadata, outputFileName: string): Record<string, string> => {
    const strings: Record<string, string> = {
        CompanyName: versionInfo.companyName ?? readAuthorName(packageJson.author) ?? "",
        FileDescription: versionInfo.fileDescription ?? packageJson.description ?? packageJson.name ?? "",
        FileVersion: versionInfo.fileVersion ?? packageJson.version ?? "0.0.0",
        InternalName: versionInfo.internalName ?? packageJson.name ?? "",
        LegalCopyright: versionInfo.legalCopyright ?? "",
        OriginalFilename: versionInfo.originalFilename ?? outputFileName,
        ProductName: versionInfo.productName ?? packageJson.name ?? "",
        ProductVersion: versionInfo.productVersion ?? packageJson.version ?? "0.0.0",
    };

    // Empty strings show up as blank rows in the Windows properties dialog, so drop them.
    for (const [key, value] of Object.entries(strings)) {
        if (value === "") {
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- keys come from the fixed literal above, not user input.
            delete strings[key];
        }
    }

    return strings;
};

interface PatchWindowsBinaryOptions {
    /** Absolute path of the pristine `node.exe` to patch. */
    basePath: string;
    /** Final executable file name, used as `OriginalFilename`. */
    outputFileName: string;
    packageJson: PackageMetadata;
    /** Project root that a relative `icon` path is resolved against. */
    rootDir: string;
    /** Absolute path the patched copy is written to. */
    targetPath: string;
    windows: ExeWindowsOptions;
}

/**
 * Writes an icon and/or version information into a copy of the base `node.exe`.
 *
 * The resources are applied to the base binary *before* the SEA blob is injected.
 * Rewriting a PE after injection would relocate the sections the blob lives in, which
 * corrupts the executable, so the order here is deliberate.
 * @param options The base binary, where to write the patched copy, and what to write.
 * @returns The path of the patched binary (`targetPath`).
 * @throws If `resedit` is not installed, or the icon file is missing or is not a `.ico`.
 */
const patchWindowsBinary = async (options: PatchWindowsBinaryOptions): Promise<string> => {
    const { basePath, outputFileName, packageJson, rootDir, targetPath, windows } = options;
    const { icon, versionInfo } = windows;

    if (!icon && !versionInfo) {
        await copyFile(basePath, targetPath);

        return targetPath;
    }

    const resedit = loadResedit();

    debug("Patching Windows resources into %s -> %s", basePath, targetPath);

    const executable = await resedit.NtExecutable.from(await readFile(basePath));
    const resource = resedit.NtExecutableResource.from(executable);

    if (icon) {
        const iconPath = resolve(rootDir, icon);

        if (extname(iconPath).toLowerCase() !== ".ico") {
            throw new Error(`\`exe.windows.icon\` must point at a .ico file, received "${icon}".`);
        }

        if (!(await isAccessible(iconPath))) {
            throw new Error(`\`exe.windows.icon\` points at "${iconPath}", which does not exist or is not readable.`);
        }

        const iconFile = resedit.Data.IconFile.from(await readFile(iconPath));

        resedit.Resource.IconGroupEntry.replaceIconsForResource(
            resource.entries,
            1,
            LANGUAGE_ID,
            iconFile.icons.map((entry) => entry.data),
        );

        debug("Replaced icon group with %d icons from %s", iconFile.icons.length, iconPath);
    }

    if (versionInfo) {
        const fields: ExeVersionInfo = versionInfo === true ? {} : versionInfo;
        // Start from node.exe's own version resource so fields we do not set stay
        // structurally valid, and fall back to an empty one if it has none.
        const [existing] = resedit.Resource.VersionInfo.fromEntries(resource.entries);
        const info = existing ?? resedit.Resource.VersionInfo.createEmpty();
        const strings = buildVersionStrings(fields, packageJson, outputFileName);

        info.setFileVersion(...toVersionQuad(strings.FileVersion), LANGUAGE_ID);
        info.setProductVersion(...toVersionQuad(strings.ProductVersion), LANGUAGE_ID);
        info.setStringValues({ codepage: CODE_PAGE, lang: LANGUAGE_ID }, strings);
        info.outputToResourceEntries(resource.entries);

        debug("Applied version info: %O", strings);
    }

    resource.outputResource(executable);

    await writeFile(targetPath, Buffer.from(executable.generate()));

    return targetPath;
};

/**
 * Builds the temp path a patched base binary is written to.
 * @param temporaryDirectory The build's scratch directory.
 * @returns An absolute path inside `temporaryDirectory`.
 */
const getPatchedBinaryPath = (temporaryDirectory: string): string => join(temporaryDirectory, "node-patched.exe");

export type { PackageMetadata, PatchWindowsBinaryOptions };
export { buildVersionStrings, getPatchedBinaryPath, patchWindowsBinary, toVersionQuad };
