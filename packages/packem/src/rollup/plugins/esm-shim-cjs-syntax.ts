import { env } from "node:process";

import type { PackageJson } from "@visulima/package";
import MagicString from "magic-string";
import { findStaticImports } from "mlly";
import type { Plugin } from "rollup";
import { minVersion } from "semver";

// not char, or space before require(.resolve)?(
const GLOBAL_REQUIRE_REGEX = /\Wrequire(?:\.resolve)?\(/;

// Shim __dirname, __filename and require
const CJSToESM = (code: string, shim: (hasFilename: boolean, hasDirname: boolean, hasGlobalRequire: boolean) => string) => {
    // INTERNAL_PACKEM_BUILD is set to "1" when building packem itself
    if (
        env.INTERNAL_PACKEM_BUILD !== "1" &&
        (code.includes("// -- packem CommonJS __filename shim") ||
            code.includes("// -- packem CommonJS __dirname shim") ||
            code.includes("// -- packem CommonJS require shim"))
    ) {
        return null;
    }

    let hasFilename = false;
    let hasDirname = false;
    let hasGlobalRequire = false;

    if (code.includes("__filename")) {
        hasFilename = true;
    }

    if (code.includes("__dirname")) {
        hasDirname = true;
    }

    if (GLOBAL_REQUIRE_REGEX.test(code)) {
        hasGlobalRequire = true;
    }

    if (!hasFilename && !hasDirname && !hasGlobalRequire) {
        return null;
    }

    const lastESMImport = findStaticImports(code).pop();
    const indexToAppend = lastESMImport ? lastESMImport.end : 0;
    const s = new MagicString(code);

    s.appendRight(indexToAppend, shim(hasFilename, hasDirname, hasGlobalRequire));

    return {
        code: s.toString(),
        map: s.generateMap(),
    };
};

const generateCJSShim = (hasFilename: boolean, hasDirname: boolean, hasGlobalRequire: boolean) => {
    let shim = "";

    if (hasFilename || hasDirname) {
        shim += `import __cjs_url__ from "node:url"; // -- packem CommonJS __filename shim --\n`;
    }

    if (hasDirname) {
        shim += `import __cjs_path__ from "node:path"; // -- packem CommonJS __dirname shim --\n`;
    }

    if (hasGlobalRequire) {
        shim += `import __cjs_mod__ from "node:module"; // -- packem CommonJS require shim --\n`;
    }

    if (hasFilename || hasDirname) {
        shim += "const __filename = __cjs_url__.fileURLToPath(import.meta.url);\n";
    }

    if (hasDirname) {
        shim += "const __dirname = __cjs_path__.dirname(__filename);\n";
    }

    if (hasGlobalRequire) {
        shim += "const require = __cjs_mod__.createRequire(import.meta.url);\n";
    }

    return shim;
};

// eslint-disable-next-line @typescript-eslint/naming-convention
const generateCJSShimNode20_11 = (hasFilename: boolean, hasDirname: boolean, hasGlobalRequire: boolean) => {
    let shim = "";

    if (hasGlobalRequire) {
        shim += `import __cjs_mod__ from "node:module"; // -- packem CommonJS require shim --\n`;
    }

    if (hasFilename) {
        shim += "const __filename = import.meta.filename; // -- packem CommonJS __filename shim --\n";
    }

    if (hasDirname) {
        shim += "const __dirname = import.meta.dirname; // -- packem CommonJS __dirname shim --\n";
    }

    if (hasGlobalRequire) {
        shim += "const require = __cjs_mod__.createRequire(import.meta.url);\n";
    }

    return shim;
};

const cjsPlugin = (packageJson: PackageJson): Plugin =>
    ({
        name: "packem:cjs",
        renderChunk(code, _chunk, options) {
            if (options.format === "es") {
                let shim = generateCJSShim;

                if (packageJson.engines?.node) {
                    const minNodeVersion = minVersion(packageJson.engines.node);

                    if (minNodeVersion && minNodeVersion.major >= 20 && minNodeVersion.minor >= 11) {
                        shim = generateCJSShimNode20_11;
                    }
                }

                return CJSToESM(code, shim);
            }

            return null;
        },
    }) as Plugin;

export default cjsPlugin;
