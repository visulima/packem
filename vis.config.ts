import { defineConfig } from "@visulima/vis/config";

// Secure defaults are applied automatically by defineConfig().
// You only need to add allowBuilds for packages with build scripts.
// Run 'vis check --security-config' to see all active settings.
// Root scripts select projects with `--query "tag=type:package"` (packages/*). vis has no
// .nxignore equivalent or glob queries (https://github.com/visulima/vis/issues/52), and the
// fixtures under packages/packem/__fixtures__/ecosystem are workspace packages whose `test`
// scripts exit 1, so an untagged `vis run test` would run them.
//
// The `"!packem"` entries in packages/*/project.json are ignored by vis for now
// (https://github.com/visulima/vis/issues/51): affected runs select a superset of what nx did.
export default defineConfig({
    defaultBase: "main",
    namedInputs: {
        default: ["sharedGlobals", "{projectRoot}/**/*", "!{projectRoot}/**/*.md"],
        production: ["default", "!{projectRoot}/**/?(*.)+(spec|test).[jt]s?(x)?(.snap)"],
        testing: ["default", "{projectRoot}/**/?(*.)+(spec|test).[jt]s?(x)?(.snap)"],
        sharedGlobals: [
            "{workspaceRoot}/.nvmrc",
            "{workspaceRoot}/package.json",
            "{workspaceRoot}/tsconfig.json",
            "{workspaceRoot}/tsconfig.base.json",
            "{workspaceRoot}/tsconfig.eslint.json",
        ],
    },
    tasks: {
        build: {
            cache: true,
            dependsOn: ["^build"],
            inputs: ["production", "^production"],
            outputs: ["{projectRoot}/dist"],
        },
        "build:prod": {
            cache: true,
            dependsOn: ["^build:prod"],
            inputs: ["production", "^production"],
            outputs: ["{projectRoot}/dist"],
        },
        "lint:eslint": {
            cache: true,
            inputs: ["default"],
        },
        "lint:package-json": {
            cache: true,
        },
        "lint:prettier": {
            cache: true,
        },
        "lint:types": {
            cache: true,
        },
        test: {
            cache: true,
            inputs: ["testing", "^production", "{projectRoot}/vite.config.ts", "{workspaceRoot}/tools/get-vitest-config.ts"],
        },
        "test:coverage": {
            cache: true,
            inputs: ["testing", "^production", "{projectRoot}/vite.config.ts", "{workspaceRoot}/tools/get-vitest-config.ts"],
            outputs: ["{projectRoot}/coverage"],
        },
    },
    security: {
        allowBuilds: {
            // "esbuild": true,
        },
    },
    // CI runs the suite on node 22, 24 and 25 on purpose; never let vis swap in the .nvmrc node.
    toolchain: {
        autoInstall: false,
    },
    taskRunner: {
        parallel: 5,
    },
});
