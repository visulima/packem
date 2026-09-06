import { describe, expect, it } from "vitest";

import { findSourcePhaseImports, maskNonCode } from "../../../../src/plugins/wasm/scan";

const specifiers = (code: string): string[] => findSourcePhaseImports(code).map(({ specifier }) => specifier);

describe(findSourcePhaseImports, () => {
    it("should find a declaration at the top of a module", () => {
        expect.assertions(1);

        expect(findSourcePhaseImports(`import source mod from "./add.wasm";\n`)).toStrictEqual([
            { binding: "mod", index: 0, specifier: "./add.wasm", statement: `import source mod from "./add.wasm"` },
        ]);
    });

    it("should find every declaration in source order", () => {
        expect.assertions(1);

        const code = ['import source a from "./a.wasm";', 'import source b from "./b.wasm";', 'import source c from "./c.wasm";'].join("\n");

        expect(specifiers(code)).toStrictEqual(["./a.wasm", "./b.wasm", "./c.wasm"]);
    });

    it("should ignore a declaration inside a block comment", () => {
        expect.assertions(1);

        const code = [
            "/**",
            " * The old API looked like this:",
            " *",
            'import source legacy from "./legacy.wasm";',
            " */",
            'import source mod from "./real.wasm";',
        ].join("\n");

        expect(specifiers(code)).toStrictEqual(["./real.wasm"]);
    });

    it("should ignore a declaration inside a multi-line template literal", () => {
        expect.assertions(1);

        const code = ["const snippet = `", 'import source doc from "./doc.wasm";', "`;", 'import source mod from "./real.wasm";'].join("\n");

        expect(specifiers(code)).toStrictEqual(["./real.wasm"]);
    });

    it("should ignore a declaration inside a line comment", () => {
        expect.assertions(1);

        const code = ['// import source old from "./old.wasm";', 'import source mod from "./real.wasm";'].join("\n");

        expect(specifiers(code)).toStrictEqual(["./real.wasm"]);
    });

    it("should ignore a declaration inside a quoted string", () => {
        expect.assertions(1);

        const code = ["const example = 'import source quoted from \"./quoted.wasm\";';", 'import source mod from "./real.wasm";'].join("\n");

        expect(specifiers(code)).toStrictEqual(["./real.wasm"]);
    });

    it("should still find a declaration after a template interpolation", () => {
        expect.assertions(1);

        const code = [`const label = \`value: \${1 + 1} and \` + \`more\`;`, 'import source mod from "./real.wasm";'].join("\n");

        expect(specifiers(code)).toStrictEqual(["./real.wasm"]);
    });

    it("should still find a declaration after a nested template interpolation", () => {
        expect.assertions(1);

        const code = [`const label = \`a \${\`b \${1} c\`} d\`;`, 'import source mod from "./real.wasm";'].join("\n");

        expect(specifiers(code)).toStrictEqual(["./real.wasm"]);
    });

    it("should ignore a declaration inside a template interpolation's nested string", () => {
        expect.assertions(1);

        const code = [`const label = \`a \${'import source nested from "./nested.wasm"'} b\`;`, 'import source mod from "./real.wasm";'].join("\n");

        expect(specifiers(code)).toStrictEqual(["./real.wasm"]);
    });

    it("should ignore a declaration inside a regular expression literal", () => {
        expect.assertions(1);

        const code = [String.raw`const pattern = /import source re from ".\/re.wasm"/;`, 'import source mod from "./real.wasm";'].join("\n");

        expect(specifiers(code)).toStrictEqual(["./real.wasm"]);
    });

    it("should not mistake division for a regular expression", () => {
        expect.assertions(1);

        const code = ["const ratio = width / height;", "const half = ratio / 2;", 'import source mod from "./real.wasm";'].join("\n");

        expect(specifiers(code)).toStrictEqual(["./real.wasm"]);
    });

    it("should find a declaration that is not the first token on its line", () => {
        expect.assertions(1);

        expect(specifiers('const x = 1; import source mod from "./real.wasm";')).toStrictEqual(["./real.wasm"]);
    });

    it("should ignore a property access named import", () => {
        expect.assertions(1);

        expect(specifiers('meta.import source mod from "./real.wasm"')).toStrictEqual([]);
    });

    it("should ignore an identifier that merely ends in import", () => {
        expect.assertions(1);

        expect(specifiers('reimport source mod from "./real.wasm"')).toStrictEqual([]);
    });

    it("should return nothing when the module mentions neither token", () => {
        expect.assertions(1);

        expect(findSourcePhaseImports("export const answer = 42;\n")).toStrictEqual([]);
    });

    it("should report an offset the declaration can be spliced at", () => {
        expect.assertions(1);

        const code = ['// import source old from "./old.wasm";', 'import source mod from "./real.wasm";'].join("\n");
        const [found] = findSourcePhaseImports(code);
        const index = found?.index ?? 0;

        expect(code.slice(index, index + (found?.statement.length ?? 0))).toBe('import source mod from "./real.wasm"');
    });
});

describe(maskNonCode, () => {
    const marked = (code: string, needle: string): boolean => {
        const mask = maskNonCode(code);
        const index = code.indexOf(needle);

        return mask[index] === 1;
    };

    it("should mark code outside any literal", () => {
        expect.assertions(1);

        expect(marked("const answer = 42;", "answer")).toBe(true);
    });

    it("should not mark the body of a string", () => {
        expect.assertions(1);

        expect(marked('const value = "answer";', "answer")).toBe(false);
    });

    it("should not mark the body of a comment", () => {
        expect.assertions(2);

        expect(marked("/* answer */", "answer")).toBe(false);
        expect(marked("// answer", "answer")).toBe(false);
    });

    it("should mark an interpolated expression inside a template", () => {
        expect.assertions(2);

        expect(marked(`\`a \${answer} b\``, "answer")).toBe(true);
        expect(marked(`\`\${1} answer\``, "answer")).toBe(false);
    });

    it("should not run past an unterminated construct", () => {
        expect.assertions(3);

        expect(maskNonCode('const a = "unterminated')).toHaveLength(23);
        expect(maskNonCode("/* unterminated")).toHaveLength(15);
        expect(maskNonCode("`unterminated")).toHaveLength(13);
    });
});
