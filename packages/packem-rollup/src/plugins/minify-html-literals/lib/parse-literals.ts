/**
 * Ported from https://github.com/lit/lit/tree/main/packages/labs/rollup-plugin-minify-html-literals
 *
 * BSD-3-Clause License
 *
 * Copyright (c) 2024 Google LLC
 */
import type { Strategy, Template } from "./models.js";
import typescript from "./typescript.js";

export interface ParseLiteralsOptions {
    fileName?: string;
    strategy?: Partial<Strategy<unknown>>;
}

export const parseLiterals = (source: string, options: ParseLiteralsOptions = {}): Template[] => {
    const strategy = {
        ...(<Strategy<unknown>>typescript),
        ...options.strategy,
    };

    const literals: Template[] = [];
    const visitedTemplates: unknown[] = [];

    strategy.walkNodes(strategy.getRootNode(source, options.fileName), (node) => {
        if (strategy.isTaggedTemplate(node)) {
            const template = strategy.getTaggedTemplateTemplate(node) as unknown;

            visitedTemplates.push(template);
            literals.push({
                parts: strategy.getTemplateParts(template),
                tag: strategy.getTagText(node),
            });
        } else if (strategy.isTemplate(node) && !visitedTemplates.includes(node)) {
            literals.push({
                parts: strategy.getTemplateParts(node),
            });
        }
    });

    return literals;
}
