import { writeJson } from "@visulima/fs";
import type { PackageJson } from "@visulima/package";

const createPackageJson = async (fixturePAth: string, data: PackageJson, transformer: "esbuild" | "oxc" | "sucrase" | "swc" = "esbuild"): Promise<void> => {
    await writeJson(
        `${fixturePAth}/package.json`,
        {
            ...data,
            devDependencies: {
                [transformer === "swc" ? "@swc/core" : transformer === "oxc" ? "oxc-transform" : transformer]: "*",
                ...data.devDependencies,
            },
            sideEffects: true,
        },
        {
            overwrite: true,
        },
    );
};

export default createPackageJson;
