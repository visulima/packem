import { writeJson } from "@visulima/fs";
import type { PackageJson } from "@visulima/package";

// type-fest@0.20.2 (hoisted by @visulima/package) is missing modern fields like
// `typesVersions`, `imports`, `tsup`, `unbuild`, `packem`. Accept the broader
// shape here so tests can author fixtures with those keys without per-call casts.
type PackageJsonInput = PackageJson & Record<string, unknown>;

const createPackageJson = async (fixturePAth: string, data: PackageJsonInput, transformer: "esbuild" | "oxc" | "sucrase" | "swc" = "esbuild"): Promise<void> => {
    // Generate default exports if module is provided but exports is not
    // Use .mjs/.cjs only if both ESM and CJS are supported (both main and module, or both require and import in exports)
    const defaultExports
        = data.exports
            ?? (data.module
                ? {
                    ".": {
                        import: data.module.startsWith("./") ? data.module : `./${data.module}`,
                        ...data.types ? { types: data.types.startsWith("./") ? data.types : `./${data.types}` } : {},
                    },
                }
                : undefined);

    await writeJson(
        `${fixturePAth}/package.json`,
        {
            ...data,
            devDependencies: {
                // eslint-disable-next-line sonarjs/no-nested-conditional
                [transformer === "swc" ? "@swc/core" : transformer === "oxc" ? "oxc-transform" : transformer]: "*",
                ...data.devDependencies,
            },
            engines: data.engines ?? {
                node: ">=18.0.0",
            },
            exports: data.exports ?? defaultExports,
            sideEffects: true,
        },
        {
            overwrite: true,
        },
    );
};

export default createPackageJson;
