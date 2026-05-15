/**
 * Ported from https://github.com/lit/lit/tree/main/packages/labs/rollup-plugin-minify-html-literals
 *
 * BSD-3-Clause License
 *
 * Copyright (c) 2024 Google LLC
 */
import ts from "typescript";

import type { TemplatePart } from "./models.js";

interface TypescriptStrategy {
    getHeadTemplatePart: (node: ts.TemplateLiteral | ts.TemplateHead) => TemplatePart;
    getMiddleTailTemplatePart: (node: ts.TemplateMiddle | ts.TemplateTail) => TemplatePart;
    getRootNode: (source: string, fileName?: string) => ts.SourceFile;
    getTaggedTemplateTemplate: (node: ts.TaggedTemplateExpression) => ts.TemplateLiteral;
    getTagText: (node: ts.TaggedTemplateExpression) => string;
    getTemplateParts: (node: ts.TemplateLiteral) => TemplatePart[];
    isTaggedTemplate: (node: ts.Node) => node is ts.TaggedTemplateExpression;
    isTemplate: (node: ts.Node) => node is ts.TemplateLiteral;
    walkChildNodes: (node: ts.Node, visit: (node: ts.Node) => void) => void;
    walkNodes: (root: ts.SourceFile, visit: (node: ts.Node) => void) => void;
}

let currentRoot: ts.SourceFile | undefined;

const typescriptStrategy: TypescriptStrategy = {
    getHeadTemplatePart(node: ts.TemplateLiteral | ts.TemplateHead): TemplatePart {
        const fullText = node.getFullText(currentRoot);
        // ignore prefix spaces and comments
        const startOffset = fullText.indexOf("`") + 1;
        const endOffset = ts.isTemplateHead(node) ? -2 : -1;

        return {
            end: node.end + endOffset,
            start: node.pos + startOffset,
            text: fullText.slice(startOffset, fullText.length + endOffset),
        };
    },
    getMiddleTailTemplatePart(node: ts.TemplateMiddle | ts.TemplateTail): TemplatePart {
        // Use text, not fullText, to avoid prefix comments, which are part of the
        // expression.
        const text = node.getText(currentRoot);
        const endOffset = ts.isTemplateMiddle(node) ? 2 : 1;

        return {
            end: node.end - endOffset,
            // Use getStart() and not node.pos, which may include prefix comments,
            // which are part of the expression
            start: node.getStart(currentRoot) + 1,
            text: text.slice(1, text.length - endOffset),
        };
    },
    getRootNode(source: string, fileName = ""): ts.SourceFile {
        return ts.createSourceFile(fileName, source, ts.ScriptTarget.ESNext);
    },
    getTaggedTemplateTemplate(node: ts.TaggedTemplateExpression): ts.TemplateLiteral {
        return node.template;
    },
    getTagText(node: ts.TaggedTemplateExpression): string {
        return node.tag.getText(currentRoot);
    },
    getTemplateParts(node: ts.TemplateLiteral): TemplatePart[] {
        if (ts.isNoSubstitutionTemplateLiteral(node)) {
            // "`string`"
            return [typescriptStrategy.getHeadTemplatePart(node)];
        }

        return [
            // "`head${" "}middle${" "}tail`"
            typescriptStrategy.getHeadTemplatePart(node.head),
            ...node.templateSpans.map((templateSpan) => typescriptStrategy.getMiddleTailTemplatePart(templateSpan.literal)),
        ];
    },
    isTaggedTemplate: ts.isTaggedTemplateExpression,
    isTemplate: ts.isTemplateLiteral,
    walkChildNodes(node: ts.Node, visit: (node: ts.Node) => void): void {
        visit(node);
        ts.forEachChild(node, (child) => {
            typescriptStrategy.walkChildNodes(child, visit);
        });
    },
    walkNodes(root: ts.SourceFile, visit: (node: ts.Node) => void): void {
        currentRoot = root;
        typescriptStrategy.walkChildNodes(root, visit);
        currentRoot = undefined;
    },
};

export type { TypescriptStrategy };
export default typescriptStrategy;
