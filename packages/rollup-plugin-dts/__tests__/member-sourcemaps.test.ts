import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { EncodedSourceMap } from "@jridgewell/source-map";
import { SourceMapConsumer } from "@jridgewell/source-map";
import { rollup } from "rollup";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dts } from "../src/index.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = path.resolve(dirname, "fixtures/member-sourcemaps");
const input = path.join(fixtureDirectory, "index.ts");
const tsconfig = path.join(fixtureDirectory, "tsconfig.json");

type FixtureFile = "index.ts" | "shape.ts";

interface MemberCase {
    /** Source file the member is declared in. */
    file: FixtureFile;
    /** Text that must match a line of the emitted `index.d.ts`. */
    generated: string;
    /** Which occurrence (0-based) of `generated` to use when the text is not unique. */
    nth?: number;
    /** Text that identifies the expected line in `file`. */
    source: string;
    /** Which occurrence (0-based) of `source` to use when the text is not unique. */
    sourceNth?: number;
    /** Identifier whose column is probed on the generated line. Defaults to the line's first word. */
    token?: string;
}

/** Members, merged declarations and a second module, for every generator. */
const cases: MemberCase[] = [
    { file: "index.ts", generated: "interface Options {", nth: 0, source: "export interface Options {", sourceNth: 0, token: "Options" },
    { file: "index.ts", generated: "name: string;", source: "name: string;" },
    { file: "index.ts", generated: "depth: number;", source: "depth: number;" },
    { file: "index.ts", generated: "run(input: string): void;", source: "run(input: string): void;", token: "run" },
    { file: "index.ts", generated: "interface Options {", nth: 1, source: "export interface Options {", sourceNth: 1, token: "Options" },
    { file: "index.ts", generated: "extra: boolean;", source: "extra: boolean;" },
    { file: "index.ts", generated: "size: number;", source: "public size: number" },
    { file: "index.ts", generated: "label: string;", source: "label: string" },
    { file: "index.ts", generated: "render(): string;", source: "render(): string", token: "render" },
    { file: "index.ts", generated: "Fast = 1", source: "Fast = 1" },
    { file: "index.ts", generated: "type Id = string;", source: "export type Id = string;", token: "Id" },
    { file: "index.ts", generated: "key: Id;", source: "key: Id;" },
    { file: "index.ts", generated: "x: number;", source: "x: number;" },
    { file: "index.ts", generated: "norm(): number;", source: "norm(): number;", token: "norm" },
    { file: "index.ts", generated: "declare function parse(input: string)", source: "export function parse(input: string): number;", token: "parse" },
    { file: "index.ts", generated: "declare function parse(input: number)", source: "export function parse(input: number): string;", token: "parse" },
    { file: "index.ts", generated: "shape: Shape;", source: "shape: Shape;" },
    { file: "shape.ts", generated: "sides: number;", source: "sides: number;" },
    { file: "shape.ts", generated: "area(): number;", source: "area(): number;", token: "area" },
];

/** 1-based line of the `nth` occurrence of `needle`; throws when there are not that many. */
const lineOf = (text: string, needle: string, nth = 0): number => {
    const matches = text.split("\n").flatMap((line, index) => (line.includes(needle) ? [index + 1] : []));

    if (matches.length <= nth) {
        throw new Error(`"${needle}" occurs ${String(matches.length)} time(s), expected occurrence ${String(nth)}`);
    }

    return matches[nth];
};

/** Decodes the emitted map and checks its envelope, then returns a consumer over it. */
const decodeMap = (sourcemap: string): SourceMapConsumer => {
    const map = JSON.parse(sourcemap) as EncodedSourceMap;
    const consumer = new SourceMapConsumer(map);

    expect(consumer.version).toBe(3);
    expect(consumer.file).toBe("index.d.ts");
    expect(consumer.sources).toStrictEqual([expect.stringContaining("member-sourcemaps/shape.ts"), expect.stringContaining("member-sourcemaps/index.ts")]);

    return consumer;
};

const LEADING_WORD = /^[\w$]+/;

const generators = [
    ["oxc", { oxc: true }],
    ["tsc", { oxc: false }],
    ["tsgo", { tsgo: true }],
] as const;

describe("member source maps", () => {
    let temporaryDirectory: string;

    beforeAll(async () => {
        temporaryDirectory = await mkdtemp(path.join(tmpdir(), "dts-member-sourcemaps-"));
    });

    afterAll(async () => {
        await rm(temporaryDirectory, { force: true, recursive: true });
    });

    describe.each(generators)("%s", (generator, generatorOptions) => {
        it("maps member lines to the member's source line, not the declaration header", async () => {
            expect.hasAssertions();

            const directory = path.join(temporaryDirectory, generator);
            const bundle = await rollup({
                input,
                plugins: [
                    dts({
                        emitDtsOnly: true,
                        sourcemap: true,
                        tsconfig,
                        ...generatorOptions,
                    }),
                ],
            });

            await bundle.write({ dir: directory, sourcemap: true });

            const code = await readFile(path.join(directory, "index.d.ts"), "utf8");
            const consumer = decodeMap(await readFile(path.join(directory, "index.d.ts.map"), "utf8"));
            const generatedLines = code.split("\n");
            const sourceTexts: Record<FixtureFile, string> = {
                "index.ts": await readFile(input, "utf8"),
                "shape.ts": await readFile(path.join(fixtureDirectory, "shape.ts"), "utf8"),
            };

            for (const memberCase of cases) {
                const matching = generatedLines.flatMap((line, index) => (line.includes(memberCase.generated) ? [index] : []));
                const generatedIndex = matching.at(memberCase.nth ?? 0);

                if (generatedIndex === undefined) {
                    throw new Error(`"${memberCase.generated}" not found in the emitted ${generator} index.d.ts`);
                }

                const generatedLine = generatedLines[generatedIndex];
                const token = memberCase.token ?? LEADING_WORD.exec(generatedLine.trimStart())?.[0] ?? "";
                const column = generatedLine.indexOf(token);
                const expectedLine = lineOf(sourceTexts[memberCase.file], memberCase.source, memberCase.sourceNth ?? 0);
                const position = consumer.originalPositionFor({ column, line: generatedIndex + 1 });

                expect(position.source, `${generator}: "${memberCase.generated}" has no mapping`).toStrictEqual(expect.stringContaining(memberCase.file));
                expect(position.line, `${generator}: "${memberCase.generated}"`).toBe(expectedLine);
            }
        });
    });
});
