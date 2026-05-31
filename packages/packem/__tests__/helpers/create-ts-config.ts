import { writeJson } from "@visulima/fs";
import type { TsConfigJson } from "@visulima/tsconfig";

// type-fest@0.20.2 (transitively hoisted) is missing modern CompilerOptions
// values like moduleResolution: "bundler", jsx: "react-jsx", target/lib:
// "ES2022", allowImportingTsExtensions, etc. Drop those strict union fields
// and re-declare them as `string` so tests can use modern TS values without a
// cast at every call site. The fixture is JSON anyway — no runtime checking.
type LooseCompilerOptions = Omit<
    NonNullable<TsConfigJson["compilerOptions"]>,
    "jsx" | "lib" | "module" | "moduleResolution" | "target"
> & {
    jsx?: string;
    lib?: string[];
    module?: string;
    moduleResolution?: string;
    target?: string;
} & Record<string, unknown>;

type TsConfigJsonInput = Omit<TsConfigJson, "compilerOptions"> & {
    compilerOptions?: LooseCompilerOptions;
};

const createTsConfig = async (fixturePath: string, config: TsConfigJsonInput = {}, name = ""): Promise<void> => {
    await writeJson(
        `${fixturePath}/tsconfig${name}.json`,
        {
            ...config,
            compilerOptions: {
                isolatedModules: true,
                ...config.compilerOptions,
            },
        } satisfies TsConfigJsonInput,
        {
            overwrite: true,
        },
    );
};

export default createTsConfig;
