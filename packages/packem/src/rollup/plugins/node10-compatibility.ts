import { readJsonSync, writeJsonSync } from "@visulima/fs";
import type { PackageJson } from "@visulima/package";
import { join } from "@visulima/path";
import type { Plugin } from "rollup";

import type { BuildContext } from "../../types";

const generateNode10Compatibility = (context: BuildContext): void => {
    context.logger.info({
        message: "Declaration compatibility mode is enabled.",
        prefix: "dts",
    });
    const typesVersions: string[] = [];

    // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
    for (const entry of context.buildEntries.filter((bEntry) => !bEntry.chunk)) {
        if (entry.type === "entry" && entry.path.endsWith(".cjs")) {
            typesVersions.push("./" + join(context.options.outDir, entry.path.replace(/\.cjs$/, ".d.ts")));
        }
    }

    if (context.options.writeTypesVersionsToPackageJson && typesVersions.length > 0) {
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
    } else if (typesVersions.length > 0) {
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
            if (context.options.declaration !== "compatible") {
                return;
            }

            generateNode10Compatibility(context);
        },
    };
};

export default node10Compatibility;
