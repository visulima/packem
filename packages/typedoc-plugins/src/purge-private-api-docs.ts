/**
 * @license Copyright (c) 2003-2024, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md.
 */

import { existsSync, readFileSync } from "node:fs";
import { posix } from "node:path";

import type { Application, Context, DeclarationReflection } from "typedoc";
import { Converter, ReflectionKind, TypeScript } from "typedoc";

/**
 * Handles the `EVENT_END` event of the TypeDoc converter.
 *
 * Removes private API reflections from the documentation unless explicitly marked with `@publicApi`.
 *
 * @returns A function that processes reflections during the event.
 */
const onEventEnd =
    (): ((context: Context) => void) =>
    (context: Context): void => {
        const moduleReflections = context.project.getReflectionsByKind(ReflectionKind.Module).filter((reflection) => {
            if (!reflection.sources) {
                return false;
            }

            const [{ fullFileName }] = reflection.sources;
            return isPrivatePackageFile(fullFileName);
        });

        for (const reflection of moduleReflections) {
            const symbol = context.project.getSymbolFromReflection(reflection);
            if (!symbol) {
                continue;
            }

            const node = symbol.declarations?.[0];
            if (!node) {
                continue;
            }

            if (isPublicApi(node)) {
                removeUrlSourcesFromReflection(reflection);
                removeNonPublicMembersFromReflection(reflection, context);
            } else {
                context.project.removeReflection(reflection);
            }
        }
    };

/**
 * Determines if the given file is part of a private package.
 *
 * @param fileName - The file name to check.
 * @returns `true` if the file belongs to a private package, otherwise `false`.
 */
const isPrivatePackageFile = (fileName: string): boolean => {
    let dirName = posix.dirname(normalizePath(fileName));

    while (true) {
        const pathToPackageJson = posix.join(dirName, "package.json");

        if (existsSync(pathToPackageJson)) {
            return !!JSON.parse(readFileSync(pathToPackageJson, "utf8")).private;
        }

        dirName = posix.dirname(dirName);

        if (dirName === posix.dirname(dirName)) {
            throw new Error(`${fileName} is not placed inside an npm package.`);
        }
    }
};

/**
 * Determines if the reflection is inherited from a private package.
 *
 * @param reflection - The reflection to check.
 * @returns `true` if the reflection is from a private package, otherwise `false`.
 */
const isInheritedReflectionFromPrivatePackage = (reflection: DeclarationReflection): boolean =>
    reflection.sources ? isPrivatePackageFile(reflection.sources[0].fullFileName) : false;

/**
 * Determines if the reflection has an `@internal` tag.
 *
 * @param reflection - The reflection to check.
 * @returns `true` if the reflection has an `@internal` tag, otherwise `false`.
 */
const hasInternalTag = (reflection: DeclarationReflection): boolean => reflection.comment?.modifierTags.has("@internal") ?? false;

/**
 * Determines if the reflection is non-public.
 *
 * @param reflection - The reflection to check.
 * @returns `true` if the reflection is non-public, otherwise `false`.
 */
const isNonPublicReflection = (reflection: DeclarationReflection): boolean =>
    reflection.flags.isPrivate || reflection.flags.isProtected || hasInternalTag(reflection);

/**
 * Recursively removes non-public members from the given reflection.
 *
 * @param reflection - The reflection to process.
 * @param context - The TypeDoc converter context.
 */
const removeNonPublicMembersFromReflection = (reflection: DeclarationReflection, context: Context): void => {
    reflection.traverse((child) => {
        removeNonPublicMembersFromReflection(child as DeclarationReflection, context);

        if (isNonPublicReflection(child)) {
            if (!child.inheritedFrom) {
                context.project.removeReflection(child);
            } else if (isInheritedReflectionFromPrivatePackage(child)) {
                context.project.removeReflection(child);
            }
        }

        let signatures: DeclarationReflection[] | null = null;

        if (child.kind === ReflectionKind.Method) {
            signatures = child.signatures || [];
        } else if (child.kind === ReflectionKind.Accessor) {
            signatures = [child.getSignature, child.setSignature].filter(Boolean) as DeclarationReflection[];
        }

        if (signatures && signatures.length === 0) {
            context.project.removeReflection(child);
        }
    });
};

/**
 * Removes URL sources from the given reflection recursively.
 *
 * @param reflection - The reflection to process.
 */
const removeUrlSourcesFromReflection = (reflection: DeclarationReflection): void => {
    if (reflection.sources) {
        reflection.sources.forEach((source) => {
            delete source.url;
        });
    }

    reflection.traverse((child) => {
        removeUrlSourcesFromReflection(child as DeclarationReflection);
    });
};

/**
 * Determines if the given node is marked as `@publicApi`.
 *
 * @param node - The node to check.
 * @returns `true` if the node is marked as `@publicApi`, otherwise `false`.
 */
const isPublicApi = (node): boolean =>
    node.statements.some((statement) => {
        if (!Array.isArray(statement.jsDoc)) {
            return false;
        }

        return statement.jsDoc.some((jsDocument) => {
            if (!jsDocument.tags) {
                return false;
            }

            return jsDocument.tags.some((tag) => {
                if (tag.tagName.kind !== TypeScript.SyntaxKind.Identifier) {
                    return false;
                }

                if (tag.tagName.text !== "publicApi") {
                    return false;
                }

                return true;
            });
        });
    });

/**
 * Normalizes the given path, replacing backslashes with forward slashes.
 *
 * @param value - The path to normalize.
 * @returns The normalized path.
 */
const normalizePath = (value: string): string => value.replaceAll("\\", "/");

/**
 * The `typedoc-plugin-purge-private-api-docs` removes reflections collected from private packages.
 *
 * Private packages are marked with the `private: true` property in their `package.json` files.
 *
 * To expose specific private reflections in the documentation, use the `@publicApi` annotation in the block comment defining a module name.
 *
 * @param app - The TypeDoc application instance.
 */
export const load = (app: Application): void => {
    app.converter.on(Converter.EVENT_END, onEventEnd());
};
