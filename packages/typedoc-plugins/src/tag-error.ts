/**
 * @license Copyright (c) 2003-2024, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md.
 */

import type { Application, CommentDisplayPart, Context, DeclarationReflection } from "typedoc";
import { Comment, Converter, ReflectionKind, TypeParameterReflection } from "typedoc";

const ERROR_TAG_NAME = "error";

/**
 * Handles the `EVENT_END` event of the TypeDoc converter.
 * Collects error definitions from `@error` tags and adds them as reflections.
 *
 * @param context - The TypeDoc converter context.
 */
const onEventEnd = (context: Context): void => {
    const moduleReflections = context.project.getReflectionsByKind(ReflectionKind.Module);

    for (const reflection of moduleReflections) {
        const symbol = context.project.getSymbolFromReflection(reflection);

        if (!symbol) {
            continue; // Skip non-ES6 modules.
        }

        const node = symbol.declarations?.[0];
        if (!node) {
            continue;
        }

        const sourceFile = node.getSourceFile();

        // Find all `@error` occurrences.
        const nodes = findDescendant(sourceFile, (node) => {
            if (node.kind !== ts.SyntaxKind.Identifier) {
                return false;
            }

            if ((node as ts.Identifier).escapedText !== ERROR_TAG_NAME) {
                return false;
            }

            const { parent } = node as ts.Identifier;
            if (parent.tagName?.escapedText !== ERROR_TAG_NAME) {
                return false;
            }

            return !!parent.comment;
        });

        // Create error definitions from the collected nodes.
        for (const errorNode of nodes) {
            const parentNode = errorNode.parent;
            const errorName = parentNode.comment;

            const errorDeclaration = context
                .withScope(reflection)
                .createDeclarationReflection(ReflectionKind.ObjectLiteral, undefined, undefined, errorName) as DeclarationReflection;

            errorDeclaration.comment = new Comment(getCommentDisplayPart(parentNode.parent.comment));
            errorDeclaration.kindString = "Error";
            errorDeclaration.typeParameters = parentNode.parent
                .getChildren()
                .filter((childTag) => childTag !== parentNode && childTag.comment && parentNode.parent.comment)
                .map((childTag) => {
                    const typeParameter = new TypeParameterReflection(
                        (childTag.name as ts.Identifier).escapedText as string,
                        undefined,
                        undefined,
                        errorDeclaration,
                    );

                    typeParameter.type = context.converter.convertType(context.withScope(typeParameter));
                    typeParameter.comment = new Comment(getCommentDisplayPart(childTag.comment));

                    return typeParameter;
                });
        }
    }
};

/**
 * Recursively finds descendant nodes that satisfy the provided callback function.
 *
 * @param sourceFileOrNode - The source file or node to search within.
 * @param callback - A function to determine if a node matches the criteria.
 * @returns An array of matching nodes.
 */
const findDescendant = (sourceFileOrNode: ts.Node, callback: (node: ts.Node) => boolean): ts.Node[] => {
    const output: ts.Node[] = [];

    for (const node of sourceFileOrNode.getChildren()) {
        if (node.getChildCount()) {
            output.push(...findDescendant(node, callback));
        } else if (callback(node)) {
            output.push(node);
        }
    }

    return output;
};

/**
 * Converts a node or array of nodes into an array of `CommentDisplayPart` objects.
 *
 * @param commentChildrenOrValue - The comment or its children to process.
 * @returns An array of `CommentDisplayPart` objects.
 */
const getCommentDisplayPart = (commentChildrenOrValue: ts.Node[] | string | null): CommentDisplayPart[] => {
    if (!commentChildrenOrValue) {
        return [];
    }

    if (typeof commentChildrenOrValue === "string") {
        return [{ kind: "text", text: commentChildrenOrValue }];
    }

    return (commentChildrenOrValue as ts.Node[])
        .map((item: ts.Node) => {
            let { text } = item as any;

            if (item.kind === ts.SyntaxKind.JSDocLink) {
                if ((item as any).name) {
                    text = `${(item as any).name.escapedText}${text}`;
                }
                return { kind: "inline-tag", tag: "@link", text };
            }

            return { kind: "text", text };
        })
        .filter((part) => part.text.length);
};

/**
 * The `typedoc-plugin-tag-error` collects error definitions from the `@error` tag.
 *
 * Note: Currently, types for `@param` tags are not supported.
 *
 * @param app - The TypeDoc application instance.
 */
export const load = (app: Application): void => {
    app.converter.on(Converter.EVENT_END, onEventEnd);
};
