import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Materialises a large plain-JavaScript project for the build benchmarks.
 *
 * `react-synthetic` (5004 files) is committed, but a second fixture of that size
 * would add thousands of files to review for content nobody reads. The modules
 * here are mechanical, so generating them keeps the repository small while
 * producing the same shape on every machine: the output is a pure function of
 * `--modules`, with no randomness, timestamps, or ordering that could vary.
 *
 * The shape follows the same idea as rolldown's own benchmark fixtures
 * (`apps/1000` … `apps/10000`): a wide fan-out of small modules re-exported
 * through barrels, which is what stresses module-graph construction rather than
 * single-file transform speed.
 *
 * Usage (from benchmarks/):
 *   jiti ./scripts/generate-js-project.ts                 # 2000 modules, js-synthetic
 *   jiti ./scripts/generate-js-project.ts --modules 500
 *   jiti ./scripts/generate-js-project.ts --name js-huge --modules 10000
 */

const readFlag = (flag: string): string | undefined => {
    const index = process.argv.indexOf(flag);

    return index === -1 ? undefined : process.argv[index + 1];
};

const MODULES = Number.parseInt(readFlag("--modules") ?? "2000", 10);
const NAME = readFlag("--name") ?? "js-synthetic";
const MODULES_PER_BARREL = 50;

if (!Number.isInteger(MODULES) || MODULES < 1) {
    throw new Error(`--modules must be a positive integer, received ${String(readFlag("--modules"))}`);
}

const projectDirectory = join("./projects", NAME);
const sourceDirectory = join(projectDirectory, "src");
const modulesDirectory = join(sourceDirectory, "modules");

/**
 * A module with a little arithmetic and a couple of imports from its neighbours,
 * so the graph has real edges to walk instead of a flat list of constants.
 * @param index Position of this module in the generated set.
 * @returns The module source.
 */
const moduleSource = (index: number): string => {
    const previous = index === 0 ? undefined : index - 1;
    const imports = previous === undefined ? "" : `import { value${String(previous)} } from "./module-${String(previous)}.js";\n\n`;
    const base = previous === undefined ? String(index) : `value${String(previous)} + ${String(index)}`;

    return `${imports}export const value${String(index)} = ${base};

export const compute${String(index)} = (input) => {
    const scaled = input * ${String((index % 7) + 2)};

    return scaled % 2 === 0 ? scaled + value${String(index)} : scaled - value${String(index)};
};
`;
};

const barrelSource = (start: number, end: number): string => {
    const lines: string[] = [];

    for (let index = start; index < end; index += 1) {
        lines.push(`export { compute${String(index)}, value${String(index)} } from "../modules/module-${String(index)}.js";`);
    }

    return `${lines.join("\n")}\n`;
};

const entrySource = (barrelCount: number): string => {
    const imports: string[] = [];
    const uses: string[] = [];

    for (let index = 0; index < barrelCount; index += 1) {
        imports.push(`import * as barrel${String(index)} from "./barrels/barrel-${String(index)}.js";`);
        uses.push(`barrel${String(index)}`);
    }

    return `${imports.join("\n")}

const barrels = [${uses.join(", ")}];

export const total = barrels.reduce((sum, barrel) => sum + Object.keys(barrel).length, 0);

export const run = (input) => barrels.reduce((accumulator, barrel) => {
    const compute = Object.values(barrel).find((exported) => typeof exported === "function");

    return typeof compute === "function" ? compute(accumulator) : accumulator;
}, input);
`;
};

const manifest = {
    browserslist: [">0.2%", "not dead", "not op_mini all"],
    main: "./dist/index.production.js",
    name: `benchmark-${NAME}`,
    private: true,
    type: "module",
    version: "0.1.0",
};

(async () => {
    if (existsSync(projectDirectory)) {
        await rm(projectDirectory, { force: true, recursive: true });
    }

    await mkdir(modulesDirectory, { recursive: true });
    await mkdir(join(sourceDirectory, "barrels"), { recursive: true });

    const writes: Promise<void>[] = [];

    for (let index = 0; index < MODULES; index += 1) {
        writes.push(writeFile(join(modulesDirectory, `module-${String(index)}.js`), moduleSource(index)));
    }

    const barrelCount = Math.ceil(MODULES / MODULES_PER_BARREL);

    for (let index = 0; index < barrelCount; index += 1) {
        const start = index * MODULES_PER_BARREL;

        writes.push(writeFile(join(sourceDirectory, "barrels", `barrel-${String(index)}.js`), barrelSource(start, Math.min(start + MODULES_PER_BARREL, MODULES))));
    }

    writes.push(writeFile(join(sourceDirectory, "index.js"), entrySource(barrelCount)));
    writes.push(writeFile(join(projectDirectory, "package.json"), `${JSON.stringify(manifest, undefined, 4)}\n`));

    await Promise.all(writes);

    console.log(`Generated ${projectDirectory}: ${String(MODULES)} modules in ${String(barrelCount)} barrels`);
})().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});
