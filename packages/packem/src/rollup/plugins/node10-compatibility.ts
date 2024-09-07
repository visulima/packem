import { readJsonSync, writeJsonSync } from "@visulima/fs";
import type { PackageJson } from "@visulima/package";
import { join } from "@visulima/path";
import type { Plugin } from "rollup";

import type { BuildContext } from "../../types";

// This is a hack to avoid generating the typesVersions field multiple times
let generationWasCalled = false;

const generateNode10Compatibility = (context: BuildContext): void => {
    context.logger.info(
        `Compatibility mode enabled. This will generate a typesVersions field ${context.options.writeTypesVersionsToPackageJson ? "and write it to package.json" : " and display it in the console"}.`,
    );
    const typesVersions: string[] = [];

    // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
    for (const entry of context.buildEntries.filter((bEntry) => !bEntry.chunk)) {
        if (entry.type === "entry" && entry.path.endsWith(".cjs")) {
            typesVersions.push("./" + join(context.options.outDir, entry.path.replace(/\.cjs$/, ".d.ts")));
        }
    }

    if (context.options.writeTypesVersionsToPackageJson) {
        const rootPackageJsonPath = join(context.options.rootDir, "package.json");
        const packageJson = readJsonSync(rootPackageJsonPath) as PackageJson;

        writeJsonSync(
            rootPackageJsonPath,
            {
                ...packageJson,
                typesVersions: {
                    ...packageJson.typesVersions,
                    "*": {
                        // eslint-disable-next-line @typescript-eslint/require-array-sort-compare,etc/no-assign-mutated-array
                        "*": typesVersions.sort(),
                    },
                },
            },
            {
                detectIndent: true,
            },
        );
    } else {
        context.logger.info(
            // eslint-disable-next-line etc/no-assign-mutated-array,@typescript-eslint/require-array-sort-compare
            `Please add the following field into your package.json to enable node 10 compatibility:\n\n${JSON.stringify({ typesVersions: { "*": { "*": typesVersions.sort() } } }, null, 4)}`,
        );
    }
};

const node10Compatibility = (context: BuildContext): Plugin => {
    return {
        name: "packem:node10-compatibility",
        writeBundle() {
            if (generationWasCalled || context.options.declaration !== "compatible") {
                return;
            }

            generateNode10Compatibility(context);

            generationWasCalled = true;
        },
    };
};

export default node10Compatibility;
