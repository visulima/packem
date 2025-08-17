import { basename } from "@visulima/path";

import type { InjectOptions } from "../types";
import safeId from "./safe-id";

/** Variable name used for the exported CSS string */
const cssVariableName = "css";

/** Set of reserved JavaScript keywords to avoid conflicts */
const reservedWords = new Set([cssVariableName]);

/**
 * Converts a CSS class name to a legal JavaScript identifier.
 * @param name CSS class name to convert
 * @returns Legal JavaScript identifier, prefixed with underscore if it conflicts with reserved words
 * @example
 * ```typescript
 * getClassNameDefault("my-class") // "my_class"
 * getClassNameDefault("css") // "_css" (reserved word)
 * ```
 */
const getClassNameDefault = (name: string): string => {
    const id = name.replaceAll(/[^\w$]/g, "_");

    if (reservedWords.has(id)) {
        return `_${id}`;
    }

    return id;
};

export interface JsExportOptions {
    /** CSS content to export */
    css: string;
    /** Whether to generate TypeScript declarations */
    dts?: boolean;
    /** Whether to emit CSS instead of JavaScript */
    emit?: boolean;
    /** File ID for safe identifier generation */
    id: string;
    /** CSS injection configuration */
    inject?: InjectOptions | boolean | ((varname: string, id: string, output: string[]) => string);
    /** Logger for warnings */
    logger?: {
        warn: (log: { message: string; plugin?: string }) => void;
    };
    /** CSS modules exports mapping class names to hashed names */
    modulesExports: Record<string, string>;
    /** Named exports configuration */
    namedExports?: boolean | ((name: string) => string);
    /** Whether CSS modules are supported */
    supportModules: boolean;
}

export interface JsExportResult {
    /** Generated JavaScript code */
    code: string;
    /** Module side effects configuration */
    moduleSideEffects: boolean | "no-treeshake";
    /** Generated TypeScript declarations */
    types?: string;
}

/**
 * Generates JavaScript exports for CSS content with support for CSS modules and injection
 * @param options Configuration options for export generation
 * @returns Generated JavaScript code and TypeScript declarations
 */
export const generateJsExports = ({
    css,
    dts = false,
    emit = false,
    id,
    inject,
    logger,
    modulesExports,
    namedExports,
    supportModules,
}: JsExportOptions): JsExportResult => {
    // Generate safe identifiers for JavaScript output
    const saferId = (identifier: string): string => safeId(identifier, basename(id));
    const modulesVariableName = saferId("modules");

    // Build JavaScript output for CSS injection
    const output = [`var ${cssVariableName} = ${JSON.stringify(css)};`];
    const dtsOutput = [];
    const outputExports = [cssVariableName];

    // Generate named exports for CSS modules
    if (namedExports) {
        if (dts) {
            dtsOutput.push(`declare const ${cssVariableName}: string;`);
        }

        const getClassName = typeof namedExports === "function" ? namedExports : getClassNameDefault;

        // Use Object.entries instead of for..in to avoid prototype chain iteration
        for (const [name, value] of Object.entries(modulesExports)) {
            const newName = getClassName(name);

            if (name !== newName && logger) {
                logger.warn({ message: `Exported \`${name}\` as \`${newName}\` in ${id}` });
            }

            const fmt = JSON.stringify(value);

            output.push(`var ${newName} = ${fmt};`);

            if (dts) {
                dtsOutput.push(`declare const ${newName}: ${fmt};`);
            }

            outputExports.push(newName);
        }
    }

    // Handle CSS injection for runtime styles
    if (inject) {
        if (typeof inject === "function") {
            output.push(inject(cssVariableName, id, output), `var ${modulesVariableName} = ${JSON.stringify(modulesExports)};`);
        } else {
            const { treeshakeable, ...injectorOptions } = typeof inject === "object" ? inject : ({} as InjectOptions);

            const injectorName = saferId("injector");
            const injectorCall = `${injectorName}(${cssVariableName},${JSON.stringify(injectorOptions)});`;

            output.unshift(`import { cssStyleInject as ${injectorName} } from "@visulima/css-style-inject";`);

            if (!treeshakeable) {
                output.push(`var ${modulesVariableName} = ${JSON.stringify(modulesExports)};`, injectorCall);
            }

            if (treeshakeable) {
                output.push("var injected = false;");

                const injectorCallOnce = `if (!injected) { injected = true; ${injectorCall} }`;

                if (modulesExports.inject) {
                    throw new Error("`inject` keyword is reserved when using `inject.treeshakeable` option");
                }

                let getters = "";

                for (const [k, v] of Object.entries(modulesExports)) {
                    const name = JSON.stringify(k);
                    const value = JSON.stringify(v);

                    getters += `get ${name}() { ${injectorCallOnce} return ${value}; },\n`;
                }

                getters += `inject: function inject() { ${injectorCallOnce} },`;

                output.push(`var ${modulesVariableName} = {${getters}};`);
            }
        }
    }

    if (!inject && Object.keys(modulesExports).length > 0) {
        output.push(`var ${modulesVariableName} = ${JSON.stringify(modulesExports)};`);
    }

    const defaultExport = `\nexport default ${supportModules ? modulesVariableName : cssVariableName};\n`;

    output.push(defaultExport);

    if (dts) {
        if (supportModules) {
            dtsOutput.push(
                `\ninterface ModulesExports {
${Object.keys(modulesExports)
    .map((key) => `  '${key}': string;`)
    .join("\n")}
}\n`,
                typeof inject === "object" && inject.treeshakeable ? `interface ModulesExports {inject:()=>void}` : "",
                `declare const ${modulesVariableName}: ModulesExports;`,
            );
        }

        dtsOutput.push(defaultExport);
    }

    if (namedExports) {
        const namedExport = `export {\n  ${outputExports.filter(Boolean).join(",\n  ")}\n};`;

        output.push(namedExport);

        if (dts) {
            dtsOutput.push(namedExport);
        }
    }

    const outputString = output.filter(Boolean).join("\n");
    const types = dtsOutput.length > 0 ? dtsOutput.filter(Boolean).join("\n") : undefined;

    if (emit) {
        return { code: css, moduleSideEffects: true, types };
    }

    return {
        code: outputString,
        moduleSideEffects: supportModules || (typeof inject === "object" && inject.treeshakeable) ? false : "no-treeshake",
        types,
    };
};
