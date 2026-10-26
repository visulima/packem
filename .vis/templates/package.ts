/**
 * `vis generate package` — scaffold a new `@visulima/<name>` workspace package under
 * `packages/<name>/` from the files in `_package/`. Each `*.hbs` file is written without
 * its extension, with `{{packageName}}` and `{{description}}` filled in.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { CreationDirectory } from "@visulima/vis/generate";
import { createTemplate } from "@visulima/vis/generate";

const PLACEHOLDER = /\{\{\s*(packageName|description)\s*\}\}/gu;

const render = (directory: string, values: Record<string, string>): CreationDirectory => {
    const out: CreationDirectory = {};

    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);

        out[entry.name.replace(/\.hbs$/u, "")] = entry.isDirectory()
            ? render(path, values)
            : readFileSync(path, "utf8").replaceAll(PLACEHOLDER, (_, key: string) => values[key] as string);
    }

    return out;
};

export default createTemplate({
    about: {
        description: "Generates a package",
        name: "package",
    },
    destination: "packages",
    options: {
        description: {
            default: "",
            prompt: "The description of this package:",
            type: "string",
        },
        packageName: {
            prompt: "Enter package name:",
            required: true,
            type: "string",
        },
    },
    produce: ({ builtins, options }) => {
        const packageName = String(options.packageName ?? "");

        if (packageName !== packageName.toLowerCase()) {
            throw new Error("package name must be in lowercase");
        }

        if (packageName.includes(" ")) {
            throw new Error("package name cannot have spaces");
        }

        const description = typeof options.description === "string" ? options.description : "";
        const folder = packageName.replaceAll("_", "-");

        return {
            files: {
                [folder]: render(join(builtins.workspace_root, ".vis", "templates", "_package"), { description, packageName }),
            },
        };
    },
});
