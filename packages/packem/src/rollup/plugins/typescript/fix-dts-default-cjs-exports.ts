import MagicString from "magic-string";
import type { ESMExport, ParsedStaticImport } from "mlly";
import { findExports, findStaticImports, parseStaticImport } from "mlly";
import type { Span } from "oxc-parser";
import { parseSync } from "oxc-parser";
import type { LoggingFunction, Plugin, RenderedChunk } from "rollup";

type Options = {
    warn?: LoggingFunction;
};

interface CodeInfo {
    fileName: string;
    imports: string[];
}

interface ParsedExports {
    defaultAlias: string;
    defaultExport: ESMExport;
    exports: string[];
}

const extractExports = (
    code: string,
    info: CodeInfo,
    options: Options,
): ParsedExports | undefined => {
    const defaultExport = findExports(code).find((esmExport) =>
        esmExport.names.includes("default"),
    );

    if (!defaultExport) {
        options.warn?.(
            /* c8 ignore next */
            `No default export found in ${info.fileName}, it contains default export but cannot be parsed.`,
        );

        return;
    }

    const match = defaultExport.code.match(/export\s*\{([^}]*)\}/);

    if (!match?.length) {
        options.warn?.(
            `No default export found in ${info.fileName}, it contains default export but cannot be parsed.`,
        );

        return;
    }

    let defaultAlias: string | undefined;
    const exportsEntries: string[] = [];

    for (const exp of (match[1] as string).split(",").map((name) => name.trim())) {
        if (exp === "default") {
            defaultAlias = exp;
            continue;
        }

        const m = exp.match(/\s*as\s+default\s*/);

        if (m) {
            defaultAlias = exp.replace(m[0], "");
        } else {
            exportsEntries.push(exp);
        }
    }

    if (!defaultAlias) {
        options.warn?.(
            `No default export found in ${info.fileName}, it contains default export but cannot be parsed.`,
        );

        return;
    }

    return {
        defaultAlias,
        defaultExport,
        exports: exportsEntries,
    };
};

interface Decl extends Span {
    declare: boolean;
    isClass?: boolean;
    isVariable?: boolean;
}

interface DefaultExport extends Span {
    local: string;
}
interface Export {
    type: boolean;
}

type Declaration =
    import("oxc-parser").Class | import("oxc-parser").Function | import("oxc-parser").TSEnumDeclaration | import("oxc-parser").TSInterfaceDeclaration | import("oxc-parser").TSTypeAliasDeclaration | import("oxc-parser").VariableDeclaration;

const prepareDeclaration = (
    decls: Map<string, Decl>,
    decl: Declaration,
    unnamed: () => string,
) => {
    // VariableDeclaration
    if ("declarations" in decl && decl.declarations.length > 0) {
        const { id } = decl.declarations[0];

        if (id.type === "Identifier") {
            decls.set(id.name, {
                declare: decl.declare === true,
                end: decl.end,
                isVariable: true,
                start: decl.start,
            });

            return;
        }
    }

    // TSInterfaceDeclaration, TSTypeAliasDeclaration, TSEnumDeclaration, Function and Class
    if ("id" in decl && decl.id && decl.id.type === "Identifier") {
        const { name } = decl.id;

        decls.set(name, {
            declare: decl.declare === true,
            end: decl.end,
            isClass: decl.type === "ClassDeclaration",
            start: decl.start,
        });

        return;
    }

    decls.set(unnamed(), {
        declare: decl.declare === true,
        end: decl.end,
        start: decl.start,
    });
};

const createCjsNamespace = (
    code: string,
    transformedCode: string,
    info: CodeInfo,
    options: Options,
// eslint-disable-next-line sonarjs/cognitive-complexity
): string => {
    const parsed = parseSync(info.fileName, code, {
        astType: "ts",
        lang: "ts",
        sourceType: "module",
    });

    let defaultExport: DefaultExport | undefined;
    let unnamed = 0;

    const declarations = new Map<string, Decl>();
    const exportsMap = new Map<string, Export>();
    const { program } = parsed;

    for (const node of program.body) {
        if (node.type === "ExportNamedDeclaration") {
            for (const exp of node.specifiers) {
                if (exp.exported.type === "Identifier") {
                    if (exp.exported.name === "default") {
                        if (exp.local.type === "Identifier") {
                            defaultExport = { end: exp.end, local: exp.local.name, start: exp.start };
                        }
                    } else if (exp.exported.type === "Identifier") {
                        exportsMap.set(exp.exported.name, { type: exp.exportKind === "type" });
                    }
                }
            }
        } else {
            // todo: we need to review the types here since we need to write the original declarations
            // eslint-disable-next-line default-case
            switch (node.type) {
                // eslint-disable-next-line no-secrets/no-secrets
                // almost type Declaration: omit TSModuleDeclaration and TSImportEqualsDeclaration
                case "ClassDeclaration":
                case "FunctionDeclaration":
                case "TSDeclareFunction":
                case "TSEnumDeclaration":
                case "TSInterfaceDeclaration":
                case "TSTypeAliasDeclaration":
                case "VariableDeclaration": {
                    prepareDeclaration(declarations, node, () => `__unnamed_${unnamed++}$$`);
                    break;
                }
                case "ImportDeclaration":
                // eslint-disable-next-line no-secrets/no-secrets, no-fallthrough
                case "TSImportEqualsDeclaration":
                case "TSModuleDeclaration": {
                    declarations.set(`__unnamed_${unnamed++}$$`, {
                        declare: false,
                        end: node.end,
                        start: node.start,
                    });
                    break;
                }
            }
        }
    }

    if (!defaultExport) {
        options.warn?.(`Cannot infer default export from the file: ${info.fileName}`);

        return transformedCode;
    }

    const defaultLocalExport = declarations.get(defaultExport.local);

    if (!defaultLocalExport) {
        options.warn?.(`Cannot infer default export from the file: ${info.fileName}`);

        return code;
    }

    if (defaultLocalExport.isVariable) {
        options.warn?.(`Cannot use default export with a variable: ${code.slice(defaultLocalExport.start, defaultLocalExport.end)}`);

        return code;
    }

    const typeExports: string[] = [];
    const valueExports: string[] = [];

    for (const [name, exp] of exportsMap.entries()) {
        if (name === defaultExport.local) { continue; }

        if (exp.type) { typeExports.push(name); } else {
            valueExports.push(name);
        }
    }

    let preamble = "";

    if (typeExports.length > 0 || valueExports.length > 0) {
        preamble += "// @ts-ignore\n";
        preamble += `${defaultExport.local};\n`;

        if (typeExports.length > 0) {
            preamble += `export type { ${typeExports.join(", ")} };\n`;
        }

        if (valueExports.length > 0) {
            preamble += `export { ${valueExports.join(", ")} };\n`;
        }
    }

    // when using export default with a class we need to add the name as prefix in the options:
    // declare class SomeClass { parent: SomeClass, b: OtherType, ... }
    // becomes:
    // declare class SomeClass { parent: SomeClass.SomeClass, b: SomeClass.OtherType, ... }
    // where SomeClass is the namespace:
    // declare namespace SomeClass {
    //   export interface OtherType { ... }
    //   import default SomeClass;
    //   export { _default as default };
    // }
    // export = SomeClass;
    const classDeclarationRegexp = defaultLocalExport.isClass
        ? new RegExp(`\\s*${defaultLocalExport.declare ? String.raw`declare\s+` : ""}class\\s+${defaultExport.local}\\s+{\\s+`)
        : undefined;
    const useExports: string[] = [];

    for (const name of exportsMap.keys()) {
    // exclude the default export from the useExports to avoid replacing
    // its declaration with the namespace prefix
        if (name === defaultExport.local) {
            continue;
        }

        useExports.push(name);
    }

    // write the default export declaration applying the replacements with available declarations
    const ms = new MagicString(
        `${preamble}declare namespace ${defaultExport.local} {
`,
    );

    // write the declarations
    for (const [name, decl] of declarations.entries()) {
        // Skip type-only exports that are already re-exported in the preamble, except for the default export
        if (typeExports.includes(name) && name !== defaultExport.local) {
            continue;
        }

        const chunk = code.slice(decl.start, decl.end).replace(/\s+\}/, " }");

        ms.append("    ");

        // replace declare with export
        if (decl.declare) {
            ms.append(chunk.replace("declare", "export").replaceAll("    ", "        "));
        } else {
            ms.append(`export ${chunk}`.replaceAll("    ", "        "));
        }

        ms.append("\n");
    }

    // include the default export to allow use default export or the declaration
    ms.append(`    import _default = ${defaultExport.local};\n    export { _default as default };\n`);
    ms.append(`}\nexport = ${defaultExport.local};\n`);

    return ms.toString();
};

// export { default } from "magic-string";
// or
// import MagicString from 'magic-string';
// export default MagicString;
const handleDefaultCJSExportAsDefault = (
    code: string,
    { defaultExport, exports }: ParsedExports,
    imports: ParsedStaticImport[],
    info: CodeInfo,
    options: Options,
    defaultImport?: ParsedStaticImport,
): string | undefined => {
    if (defaultImport) {
        return exports.length === 0
            ? code.replace(
                defaultExport.code,
                `export = ${defaultImport.defaultImport}`,
            )
            : createCjsNamespace(
                code,
                code.replace(
                    defaultExport.code,
                    `// @ts-ignore
export = ${defaultImport.defaultImport};
export { ${exports.join(", ")} } from '${defaultExport.specifier}'`,
                ),
                info,
                options,
            );
    }

    const magicString = new MagicString(code);
    // add the import after last import in the code
    const lastImportPosition
            = imports.length > 0 ? imports.at(-1)?.end || 0 : 0;

    if (lastImportPosition > 0) {
        magicString.appendRight(
            lastImportPosition,
            `\nimport _default from '${defaultExport.specifier}';\n`,
        );
    } else {
        magicString.prepend(
            `import _default from '${defaultExport.specifier}';\n`,
        );
    }

    return exports.length > 0
        ? createCjsNamespace(
            code,
            magicString
                .replace(
                    defaultExport.code,
                    `// @ts-ignore
export = _default;
export { ${exports.join(", ")} } from '${defaultExport.specifier}'`,
                )
                .toString(),
            info,
            options,
        )
        : magicString.replace(defaultExport.code, "export = _default").toString();
};

// export { resolve as default } from "pathe";
const handleDefaultNamedCJSExport = (
    code: string,
    info: CodeInfo,
    parsedExports: ParsedExports,
    imports: ParsedStaticImport[],
    options: Options,
    defaultImport?: ParsedStaticImport | undefined,
): string | undefined => {
    const { defaultAlias, defaultExport, exports } = parsedExports;

    // export { default } from "magic-string";
    if (defaultAlias === "default") {
    // mlly parsing with _type='named', but always as default
    // {
    //   type: 'default',
    //   exports: ' default',
    //   specifier: 'magic-string',
    //   names: [ 'default' ],
    //   name: 'default',
    //   _type: 'named'
    // }

        // doesn't matter the type, it's always default (maybe mlly bug?)

        // export { resolve as default } from 'some-module';
        // {
        //   type: 'default',
        //   exports: ' resolve as default',
        //   specifier: 'some-module',
        //   names: [ 'default' ],
        //   name: 'default',
        //   _type: 'named'
        // }

        // since we don't have the import name for the default export
        // defaultImport should be undefined
        if (defaultImport && !defaultImport.defaultImport) {
            options.warn?.(
                `Cannot parse default export name from ${defaultImport.specifier} import at ${info.fileName}!.`,
            );

            return undefined;
        }

        return handleDefaultCJSExportAsDefault(
            code,
            parsedExports,
            imports,
            info,
            options,
            defaultImport,
        );
    }

    if (defaultImport) {
    // we need to add the named import to the default import
        const namedExports = defaultImport.namedImports;

        if (namedExports?.[defaultAlias] === defaultAlias) {
            return exports.length === 0
                ? code.replace(defaultExport.code, `export = ${defaultAlias}`)
                : createCjsNamespace(
                    code,
                    code.replace(
                        defaultExport.code,
                        `// @ts-ignore
export = ${defaultAlias};
export { ${exports.join(", ")} }`,
                    ),
                    info,
                    options,
                );
        }

        options.warn?.(
            `Cannot parse "${defaultAlias}" named export from ${defaultImport.specifier} import at ${info.fileName}!.`,
        );

        return undefined;
    }

    // we need to add the import
    const magicString = new MagicString(code);
    // add the import after last import in the code
    const lastImportPosition = imports.length > 0 ? imports.at(-1)?.end || 0 : 0;

    if (lastImportPosition > 0) {
        magicString.appendRight(
            lastImportPosition,
            `\nimport { ${defaultAlias} } from '${defaultExport.specifier}';\n`,
        );
    } else {
        magicString.prepend(
            `import { ${defaultAlias} } from '${defaultExport.specifier}';\n`,
        );
    }

    if (exports.length > 0) {
        return createCjsNamespace(
            code,
            magicString
                .replace(
                    defaultExport.code,
                    `// @ts-ignore
export = ${defaultAlias};
export { ${exports.join(", ")} } from '${defaultExport.specifier}'`,
                )
                .toString(),
            info,
            options,
        );
    }

    return magicString
        .replace(defaultExport.code, `export = ${defaultAlias}`)
        .toString();
};

// export { xxx as default };
const handleNoSpecifierDefaultCJSExport = (
    code: string,
    info: CodeInfo,
    { defaultAlias, defaultExport, exports }: ParsedExports,
    options: Options,
): string | undefined => {
    let exportStatement = exports.length > 0 ? undefined : "";

    // replace export { type A, type B, type ... } with export type { A, B, ... }
    // that's, if all remaining exports are type exports, replace export {} with export type {}
    if (exportStatement === undefined) {
        let someExternalExport = false;
        const typeExportRegexp = /\s*type\s+/;
        const allRemainingExports = exports.map((exp) => {
            if (someExternalExport) {
                return [exp, ""] as const;
            }

            if (!info.imports.includes(exp)) {
                const m = exp.match(typeExportRegexp);

                if (m) {
                    const name = exp.replace(m[0], "").trim();

                    if (!info.imports.includes(name)) {
                        return [exp, name] as const;
                    }
                }
            }

            someExternalExport = true;

            return [exp, ""] as const;
        });

        exportStatement = someExternalExport
            ? `;\nexport { ${allRemainingExports.map(([e, _]) => e).join(", ")} }`
            : `;\nexport type { ${allRemainingExports.map(([_, t]) => t).join(", ")} }`;
    }

    return exportStatement.length === 0
        ? code.replace(defaultExport.code, `export = ${defaultAlias}`)
        : createCjsNamespace(
            code,
            `// @ts-ignore\n${defaultAlias}${exportStatement}`,
            info,
            options,
        );
};

const MLLE_DEFAULT_FROM_RE = /^export\s+default\s+from\s+['"]([^'"]+)['"];?$/m;

const internalFixDefaultCJSExports = (
    code: string,
    info: CodeInfo,
    options: Options,
): string | undefined => {
    const mllyMatch = code.match(MLLE_DEFAULT_FROM_RE);

    if (mllyMatch) {
        const module_ = mllyMatch[1];

        return `import _default from '${module_}';\nexport = _default;`;
    }

    const parsedExports = extractExports(code, info, options);

    console.log(parsedExports);

    if (!parsedExports) {
        return undefined;
    }

    if (parsedExports.defaultExport.specifier) {
        const imports: ParsedStaticImport[] = [];

        for (const imp of findStaticImports(code)) {
            // don't add empty imports like import 'some-module';
            if (!imp.imports) {
                continue;
            }

            imports.push(parseStaticImport(imp));
        }

        const { specifier } = parsedExports.defaultExport;
        const defaultImport = imports.find((index) => index.specifier === specifier);

        console.log(imports);

        if (
            parsedExports.defaultExport._type === "named"
            && parsedExports.defaultAlias === "default"
            && parsedExports.exports.length > 0
        ) {
            // e.g. export { default, namedExport } from 'some-module';
            const named = parsedExports.exports;
            let out = `import _default from '${specifier}';\n// @ts-ignore\nexport = _default;`;

            if (named.length > 0) {
                out += `\nexport { ${named.join(", ")} } from '${specifier}'`;
            }

            return out;
        }

        // Special case: export { default as default } from 'some-module';
        const defaultExportExports = (parsedExports.defaultExport as any).exports as string | undefined;

        if (
            parsedExports.defaultAlias === "default"
            && parsedExports.exports.length === 0
            && defaultExportExports && /\bas\s+default\b/.test(defaultExportExports)
        ) {
            options.warn?.(
                `Cannot parse default export name from ${parsedExports.defaultExport.specifier} import at ${info.fileName}!.`,
            );

            return undefined;
        }

        // --- PATCH: Handle 'export { default, named } from ...' ---
        const defaultExportType = (parsedExports.defaultExport as any).type || (parsedExports.defaultExport as any)._type;

        if (
            defaultExportType === "named"
            && parsedExports.defaultAlias === "default"
            && parsedExports.exports.length > 0
        ) {
            // e.g. export { default, namedExport } from 'some-module';
            const named = parsedExports.exports;
            let out = `import _default from '${specifier}';\n// @ts-ignore\nexport = _default;`;

            if (named.length > 0) {
                out += `\nexport { ${named.join(", ")} } from '${specifier}'`;
            }

            return out;
        }
        // --- END PATCH ---

        // eslint-disable-next-line no-underscore-dangle
        return parsedExports.defaultExport._type === "named"
            ? handleDefaultNamedCJSExport(
                code,
                info,
                parsedExports,
                imports,
                options,
                defaultImport,
            )
            : handleDefaultCJSExportAsDefault(
                code,
                parsedExports,
                imports,
                info,
                options,
                defaultImport,
            ) || handleNoSpecifierDefaultCJSExport(code, info, parsedExports, options);
    }

    // export { xxx as default };
    return handleNoSpecifierDefaultCJSExport(code, info, parsedExports, options);
};

export type FixDtsDefaultCjsExportsPluginOptions = {
    matcher?: (info: RenderedChunk) => boolean;
};

export const fixDtsDefaultCjsExportsPlugin = (options: FixDtsDefaultCjsExportsPluginOptions = {}): Plugin => {
    const { matcher = (info: RenderedChunk) => info.type === "chunk"
        && info.exports?.length > 0
        && info.exports.includes("default")
        && /\.d\.c?ts$/.test(info.fileName) } = options;

    return {
        name: "packem:fix-dts-default-cjs-exports-plugin",
        renderChunk(code, info) {
            return matcher(info) && info.isEntry
                ? internalFixDefaultCJSExports(code, info, { ...options, warn: this.warn })
                : undefined;
        },
    } satisfies Plugin;
};
