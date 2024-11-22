import { writeJson } from "@visulima/fs";
import type { PackageJson } from "@visulima/package";

const createPackageJson = async (fixturePAth: string, data: PackageJson, transformer: "esbuild" | "swc" | "sucrase" = "esbuild"): Promise<void> => {
    await writeJson(
        `${fixturePAth}/package.json`,
        {
            ...data,
            devDependencies: {
                [transformer === "swc" ? "@swc/core" : transformer]: "*",
                ...data.devDependencies,
            },
        },
        {
            overwrite: true,
        },
    );
};

export default createPackageJson;
