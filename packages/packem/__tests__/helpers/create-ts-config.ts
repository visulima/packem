import { writeJson } from "@visulima/fs";
import type { TsConfigJson } from "@visulima/tsconfig";

const createTsConfig = async (fixturePath: string, config: TsConfigJson = {}, name = ""): Promise<void> => {
    await writeJson(
        fixturePath + "/tsconfig" + name + ".json",
        {
            ...config,
            compilerOptions: {
                isolatedModules: true,
                ...config.compilerOptions,
            },
        } satisfies TsConfigJson,
        {
            overwrite: true,
        },
    );
};

export default createTsConfig;
