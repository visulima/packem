import { readJsonSync, writeJsonSync } from "@visulima/fs";
import type { PackageJson } from "@visulima/package";
import { join } from "@visulima/path";
import type { Plugin } from "rollup";

import { CHUNKS_PACKEM_FOLDER, SHARED_PACKEM_FOLDER } from "../../constants";
import type { BuildContext } from "../../types";

let logDisplayed = false;

const generateNode10Compatibility = (context: BuildContext): void => {
    if (!logDisplayed) {
        context.logger.info({
            message: "Declaration compatibility mode is enabled.",
            prefix: "dts",
        });

        logDisplayed = true;
    }

    const typesVersions: string[] = [];

    // eslint-disable-next-line no-loops/no-loops,no-restricted-syntax
    for (const entry of context.buildEntries.filter((bEntry) => !bEntry.chunk)) {
        if (entry.type === "entry" && entry.path.endsWith(".cjs") && !entry.path.includes(SHARED_PACKEM_FOLDER) && !entry.path.includes(CHUNKS_PACKEM_FOLDER)) {
            typesVersions.push("./" + join(context.options.outDir, entry.path.replace(/\.cjs$/, ".d.ts")));
        }
    }

    const rootPackageJsonPath = join(context.options.rootDir, "package.json");
    const packageJson = readJsonSync(rootPackageJsonPath) as PackageJson;

    // eslint-disable-next-line etc/no-assign-mutated-array
    const sortedTypesVersions = typesVersions.sort((a, b) => a.localeCompare(b));

    if (sortedTypesVersions === packageJson.typesVersions?.["*"]?.["*"]) {
        context.logger.debug({
            message: "No changes to typesVersions field in package.json",
            prefix: "dts",
        });

        return;
    }

    if (context.options.writeTypesVersionsToPackageJson && typesVersions.length > 0) {
        writeJsonSync(
            rootPackageJsonPath,
            {
                ...packageJson,
                typesVersions: {
                    ...packageJson.typesVersions,
                    "*": {
                        "*": sortedTypesVersions,
                    },
                },
            },
            {
                detectIndent: true,
            },
        );

        context.logger.info({
            message: `Your package.json has been updated to enable node 10 compatibility.`,
            prefix: "dts",
        });
    } else if (typesVersions.length > 0) {
        context.logger.info(
            `Please add the following field into your package.json to enable node 10 compatibility:\n\n${JSON.stringify({ typesVersions: { "*": { "*": sortedTypesVersions } } }, null, 4)}`,
        );
    }
};

const node10Compatibility = (context: BuildContext): Plugin => {
    return {
        name: "packem:node10-compatibility",
        writeBundle() {
            generateNode10Compatibility(context);
        },
    };
};

export default node10Compatibility;
