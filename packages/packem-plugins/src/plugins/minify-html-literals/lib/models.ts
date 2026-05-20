/**
 * Ported from https://github.com/lit/lit/tree/main/packages/labs/rollup-plugin-minify-html-literals
 *
 * BSD-3-Clause License
 *
 * Copyright (c) 2024 Google LLC
 */
export interface Template {
    parts: TemplatePart[];
    tag?: string;
}

export interface TemplatePart {
    end: number;
    start: number;
    text: string;
}

export interface Strategy<N = unknown> {
    getRootNode: (source: string, fileName?: string) => N;
    getTaggedTemplateTemplate: (node: N) => unknown;
    getTagText: (node: N) => string;
    getTemplateParts: (node: N) => TemplatePart[];
    isTaggedTemplate: (node: N) => boolean;
    isTemplate: (node: N) => boolean;
    walkNodes: (parent: N, visit: (child: N) => void) => void;
}
