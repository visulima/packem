import type { Dirent } from "node:fs";
import { cpSync } from "node:fs";
import { readdir, rm } from "node:fs/promises";

import { ensureDir, isAccessibleSync, readFileSync, writeFile, writeJson } from "@visulima/fs";
import { basename, join, resolve } from "@visulima/path";
import { temporaryDirectory } from "tempy";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { UrlOptions } from "../../src/rollup/plugins/url";
import { createPackageJson, createPackemConfig, execPackem } from "../helpers";

const fixturePath = join(__dirname, "../..", "__fixtures__", "url");

describe("url", () => {
    let temporaryDirectoryPath: string;

    beforeEach(async () => {
        temporaryDirectoryPath = temporaryDirectory();
    });

    afterEach(async () => {
        await rm(temporaryDirectoryPath, { recursive: true });
    });

    const build = async (type: string, options: Partial<UrlOptions>, generatedFiles: string[], useSnapshot?: boolean) => {
        // copy fixtures to temporary directory
        cpSync(join(fixturePath, `${type}.js`), join(temporaryDirectoryPath, "src", `${type}.js`));
        cpSync(join(fixturePath, `${type}.${type}`), join(temporaryDirectoryPath, "src", `${type}.${type}`));

        await createPackageJson(temporaryDirectoryPath, {
            exports: {
                ".": {
                    import: `./dist/${type}.mjs`,
                    require: `./dist/${type}.cjs`,
                },
            },
        });

        await createPackemConfig(temporaryDirectoryPath, {
            config: {
                rollup: {
                    url: options,
                },
            },
            transformer: "esbuild",
        });

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        if (useSnapshot !== false) {
            const mjsContent = readFileSync(join(temporaryDirectoryPath, "dist", `${type}.mjs`));

            expect(mjsContent).toMatchSnapshot("mjs");

            const cjsContent = readFileSync(join(temporaryDirectoryPath, "dist", `${type}.cjs`));

            expect(cjsContent).toMatchSnapshot("cjs");
        }

        const distributionPath = join(temporaryDirectoryPath, "dist");

        const foundFiles: Dirent[] = await readdir(distributionPath, {
            recursive: true,
            withFileTypes: true,
        });

        const files: string[] = foundFiles
            .filter((dirent) => dirent.isFile())
            // @TODO: Change this readdir to @visulima/fs readdir
            // eslint-disable-next-line deprecation/deprecation
            .map((dirent) => join(dirent.path, dirent.name));

        expect(files).toStrictEqual(generatedFiles);
    };

    it("should inline png files", async () => {
        expect.assertions(5);

        await build("png", { limit: 10 * 1024 }, [join(temporaryDirectoryPath, "/dist/png.cjs"), join(temporaryDirectoryPath, "/dist/png.mjs")]);
    });

    it("should inline jpg files", async () => {
        expect.assertions(5);

        await build("jpg", { limit: 10 * 1024 }, [join(temporaryDirectoryPath, "/dist/jpg.cjs"), join(temporaryDirectoryPath, "/dist/jpg.mjs")]);
    });

    it("should inline jpeg files", async () => {
        expect.assertions(5);

        await build("jpeg", { limit: 10 * 1024 }, [join(temporaryDirectoryPath, "/dist/jpeg.cjs"), join(temporaryDirectoryPath, "/dist/jpeg.mjs")]);
    });

    it("should inline gif files", async () => {
        expect.assertions(5);

        await build("gif", { limit: 10 * 1024 }, [join(temporaryDirectoryPath, "/dist/gif.cjs"), join(temporaryDirectoryPath, "/dist/gif.mjs")]);
    });

    it("should inline webp files", async () => {
        expect.assertions(5);

        await build("webp", { limit: 10 * 1024 }, [join(temporaryDirectoryPath, "/dist/webp.cjs"), join(temporaryDirectoryPath, "/dist/webp.mjs")]);
    });

    it("should inline text files", async () => {
        expect.assertions(5);

        await build("svg", { limit: 10 * 1024 }, [join(temporaryDirectoryPath, "/dist/svg.cjs"), join(temporaryDirectoryPath, "/dist/svg.mjs")]);
    });

    it("inline \"large\" files", async () => {
        expect.assertions(5);

        await build("svg", { limit: 10 }, [
            join(temporaryDirectoryPath, "/dist/98ea1a8cc8cd9baf.svg"),
            join(temporaryDirectoryPath, "/dist/svg.cjs"),
            join(temporaryDirectoryPath, "/dist/svg.mjs"),
        ]);
    });

    it("should limit: 0, emitFiles: false, publicPath: empty", async () => {
        expect.assertions(5);

        await build("svg", { emitFiles: false, limit: 0, publicPath: "" }, [
            join(temporaryDirectoryPath, "/dist/svg.cjs"),
            join(temporaryDirectoryPath, "/dist/svg.mjs"),
        ]);
    });

    it("should copy files, limit: 0", async () => {
        expect.assertions(5);

        await build("svg", { emitFiles: true, limit: 0 }, [
            join(temporaryDirectoryPath, "/dist/98ea1a8cc8cd9baf.svg"),
            join(temporaryDirectoryPath, "/dist/svg.cjs"),
            join(temporaryDirectoryPath, "/dist/svg.mjs"),
        ]);
    });

    it("copy \"large\" binary files, limit: 10", async () => {
        expect.assertions(5);

        await build("svg", { emitFiles: true, limit: 10 }, [
            join(temporaryDirectoryPath, "/dist/98ea1a8cc8cd9baf.svg"),
            join(temporaryDirectoryPath, "/dist/svg.cjs"),
            join(temporaryDirectoryPath, "/dist/svg.mjs"),
        ]);
    });

    it("should copy files with include by absolute path, limit: 0", async () => {
        expect.assertions(5);

        await build(
            "svg",
            {
                emitFiles: true,
                include: [resolve(fixturePath, "*.svg")],
                limit: 0,
            },
            [
                join(temporaryDirectoryPath, "/dist/98ea1a8cc8cd9baf.svg"),
                join(temporaryDirectoryPath, "/dist/svg.cjs"),
                join(temporaryDirectoryPath, "/dist/svg.mjs"),
            ],
        );
    });

    it("should use publicPath", async () => {
        expect.assertions(5);

        await build("png", { limit: 10, publicPath: "/batman/" }, [
            join(temporaryDirectoryPath, "/dist/6b71fbe07b498a82.png"),
            join(temporaryDirectoryPath, "/dist/png.cjs"),
            join(temporaryDirectoryPath, "/dist/png.mjs"),
        ]);
    });

    it("should use publicPath with file that has empty dirname", async () => {
        expect.assertions(5);

        const type = "png";

        await build(
            type,
            {
                emitFiles: true,
                fileName: "[dirname][hash][extname]",
                limit: 10,
                publicPath: "/batman/",
                sourceDir: join(temporaryDirectoryPath, "src"),
            },
            [
                join(temporaryDirectoryPath, "/dist/6b71fbe07b498a82.png"),
                join(temporaryDirectoryPath, "/dist/png.cjs"),
                join(temporaryDirectoryPath, "/dist/png.mjs"),
            ],
            false,
        );

        const mjsContent = readFileSync(join(temporaryDirectoryPath, "dist", `${type}.mjs`));

        expect(mjsContent).toBe(`const png = "/batman/6b71fbe07b498a82.png";

export { png as default };
`);

        const cjsContent = readFileSync(join(temporaryDirectoryPath, "dist", `${type}.cjs`));

        expect(cjsContent).toBe(`'use strict';

const png = "/batman/6b71fbe07b498a82.png";

module.exports = png;
`);
    });

    it("should create a nested directory for the output, if required", async () => {
        expect.assertions(5);

        await build("png", { emitFiles: true, fileName: "joker/[hash][extname]", limit: 10 }, [
            join(temporaryDirectoryPath, "/dist/png.cjs"),
            join(temporaryDirectoryPath, "/dist/png.mjs"),
            join(temporaryDirectoryPath, "/dist/joker/6b71fbe07b498a82.png"),
        ]);
    });

    it("should create a file with the name and extension of the file", async () => {
        expect.assertions(5);

        await build("png", { emitFiles: true, fileName: "[name][extname]", limit: 10 }, [
            join(temporaryDirectoryPath, "/dist/png.cjs"),
            join(temporaryDirectoryPath, "/dist/png.mjs"),
            join(temporaryDirectoryPath, "/dist/png.png"),
        ]);
    });

    it("should create a file with the name, hash and extension of the file", async () => {
        expect.assertions(5);

        await build("png", { emitFiles: true, fileName: "[name]-[hash][extname]", limit: 10 }, [
            join(temporaryDirectoryPath, "/dist/png-6b71fbe07b498a82.png"),
            join(temporaryDirectoryPath, "/dist/png.cjs"),
            join(temporaryDirectoryPath, "/dist/png.mjs"),
        ]);
    });

    it("should prefix the file with the parent directory of the source file", async () => {
        expect.assertions(5);

        await build("png", { emitFiles: true, fileName: "[dirname][hash][extname]", limit: 10 }, [
            join(temporaryDirectoryPath, "/dist/png.cjs"),
            join(temporaryDirectoryPath, "/dist/png.mjs"),
            join(temporaryDirectoryPath, "/dist/src/6b71fbe07b498a82.png"),
        ]);
    });

    it("should prefix the file with the parent directory of the source file, relative to the sourceDir option", async () => {
        expect.assertions(5);

        const type = "png";

        const pngPath = join(basename(temporaryDirectoryPath), "/src/6b71fbe07b498a82.png");

        await build(
            type,
            {
                emitFiles: true,
                fileName: "[dirname][hash][extname]",
                limit: 10,
                sourceDir: join(temporaryDirectoryPath, ".."),
            },
            [join(temporaryDirectoryPath, "/dist/png.cjs"), join(temporaryDirectoryPath, "/dist/png.mjs"), join(temporaryDirectoryPath, "/dist/", pngPath)],
            false,
        );

        const mjsContent = readFileSync(join(temporaryDirectoryPath, "dist", `${type}.mjs`));

        expect(mjsContent).toBe(`const png = "${pngPath}";

export { png as default };
`);

        const cjsContent = readFileSync(join(temporaryDirectoryPath, "dist", `${type}.cjs`));

        expect(cjsContent).toBe(`'use strict';

const png = "${pngPath}";

module.exports = png;
`);
    });

    it("should copy the file according to destDir option", async () => {
        expect.assertions(6);

        await build(
            "png",
            {
                destDir: join(temporaryDirectoryPath, "output/dest"),
                emitFiles: true,
                fileName: "[dirname][hash][extname]",
                limit: 10,
            },
            [join(temporaryDirectoryPath, "/dist/png.cjs"), join(temporaryDirectoryPath, "/dist/png.mjs")],
        );

        expect(isAccessibleSync(join(temporaryDirectoryPath, "output/dest/src/6b71fbe07b498a82.png"))).toBe(true);
    });

    it("should import images from the node_modules", async () => {
        const type = "svg";

        await writeFile(
            join(temporaryDirectoryPath, "src", `${type}.js`),
            `import svg from "@test/images/icons/${type}.${type}";

export default svg;`,
        );

        const imagesPackagePath = join(temporaryDirectoryPath, "node_modules/@test/images");

        await ensureDir(imagesPackagePath);

        cpSync(join(fixturePath, `${type}.${type}`), join(imagesPackagePath, "icons", `${type}.${type}`));

        await writeJson(
            join(imagesPackagePath, "package.json"),
            {
                name: "@test/images",
            },
            {
                recursive: true,
            },
        );

        await createPackageJson(temporaryDirectoryPath, {
            exports: {
                ".": {
                    import: `./dist/${type}.mjs`,
                    require: `./dist/${type}.cjs`,
                },
            },
        });

        await createPackemConfig(temporaryDirectoryPath);

        const binProcess = await execPackem("build", [], {
            cwd: temporaryDirectoryPath,
            reject: false,
        });

        expect(binProcess.stderr).toBe("");
        expect(binProcess.exitCode).toBe(0);

        const mjsContent = readFileSync(join(temporaryDirectoryPath, "dist", `${type}.mjs`));

        expect(mjsContent).toMatchSnapshot("mjs");

        const cjsContent = readFileSync(join(temporaryDirectoryPath, "dist", `${type}.cjs`));

        expect(cjsContent).toMatchSnapshot("cjs");
    });
});
