import type { NormalizedOutputOptions, RenderedChunk } from "rollup";
import { parseAst } from "rollup/parseAst";
import { describe, expect, it, vi } from "vitest";

import { preserveDirectivesPlugin } from "../../../src/plugins/preserve-directives";

// Mirrors packem's real `PRESERVE_DIRECTIVE_REGEX`, which anchors on the
// surrounding quotes (the plugin tests `directiveRegex.test(`"${value}"`)`).
const USE_DIRECTIVE_REGEX = /^['"](use \w+)['"]$/;
const INCLUDE_TSX_REGEX = /\.tsx?$/;
// renderChunk emits directives as single-quoted, escaped string literals.
const USE_CLIENT_SERVER_REGEX = /'use client';\n'use server';|'use server';\n'use client';/;
const LEADING_USE_CLIENT_REGEX = /^'use client';\n/;
const LEADING_SHEBANG_REGEX = /^#!\/usr\/bin\/env node\n/;

const createLogger = () => ({ debug: vi.fn(), error: vi.fn(), info: vi.fn(), log: vi.fn(), warn: vi.fn() }) as unknown as Console;

type TransformContext = {
    parse: typeof parseAst;
    warn: (warning: { code: string; message: string }) => void;
};

type TransformResult = {
    code: string;
    map: unknown;
    meta: { preserveDirectives: { directives: string[]; shebang: string | undefined } };
};

const callTransform = (plugin: ReturnType<typeof preserveDirectivesPlugin>, code: string, id: string, context_?: Partial<TransformContext>) => {
    const handler = plugin.transform as (this: TransformContext, code: string, id: string) => TransformResult | undefined;
    const context: TransformContext = { parse: parseAst, warn: vi.fn(), ...context_ };

    return handler.call(context, code, id);
};

type RenderChunkContext = {
    getModuleInfo: (id: string) => { meta?: Record<string, unknown> } | undefined;
};

const callRenderChunk = (
    plugin: ReturnType<typeof preserveDirectivesPlugin>,
    code: string,
    chunk: Partial<RenderedChunk>,
    options: Partial<NormalizedOutputOptions>,
    getModuleInfo: RenderChunkContext["getModuleInfo"] = () => undefined,
) => {
    const { renderChunk } = plugin;
    const handler = (typeof renderChunk === "function" ? renderChunk : renderChunk?.handler) as (
        this: RenderChunkContext,
        code: string,
        chunk: RenderedChunk,
        options: NormalizedOutputOptions,
    ) => { code: string; map: unknown } | undefined;

    // Real rollup binds the plugin context (which exposes `getModuleInfo`) as
    // `this` on renderChunk; the handler reads `this.getModuleInfo(id)?.meta`
    // to recover directives on cache-hit rebuilds. Simulate that context here.
    return handler.call({ getModuleInfo }, code, chunk as RenderedChunk, options as NormalizedOutputOptions);
};

describe("preserveDirectivesPlugin", () => {
    it("should return a plugin named packem:preserve-directives", () => {
        expect.assertions(1);

        const plugin = preserveDirectivesPlugin({ directiveRegex: USE_DIRECTIVE_REGEX, logger: createLogger() });

        expect(plugin.name).toBe("packem:preserve-directives");
    });

    it("should extract a 'use client' directive and remove it from source", () => {
        expect.assertions(3);

        const plugin = preserveDirectivesPlugin({ directiveRegex: USE_DIRECTIVE_REGEX, logger: createLogger() });
        const code = "'use client';\nexport const x = 1;";
        const result = callTransform(plugin, code, "/path/file.js");

        expect(result?.code).not.toContain("'use client'");
        expect(result?.meta.preserveDirectives.directives).toContain("use client");
        expect(result?.meta.preserveDirectives.shebang).toBeUndefined();
    });

    it("should skip 'use strict' even when it matches the regex", () => {
        expect.assertions(1);

        const plugin = preserveDirectivesPlugin({ directiveRegex: USE_DIRECTIVE_REGEX, logger: createLogger() });
        const code = "'use strict';\nexport const x = 1;";
        const result = callTransform(plugin, code, "/path/file.js");

        expect(result).toBeUndefined();
    });

    it("should extract a shebang and remove it from source", () => {
        expect.assertions(3);

        const plugin = preserveDirectivesPlugin({ directiveRegex: USE_DIRECTIVE_REGEX, logger: createLogger() });
        const code = "#!/usr/bin/env node\nexport const x = 1;";
        const result = callTransform(plugin, code, "/path/cli.js");

        expect(result?.code).not.toContain("#!");
        expect(result?.meta.preserveDirectives.shebang).toBe("#!/usr/bin/env node");
        expect(result?.meta.preserveDirectives.directives).toStrictEqual([]);
    });

    it("should return undefined when neither shebang nor directive is present", () => {
        expect.assertions(1);

        const plugin = preserveDirectivesPlugin({ directiveRegex: USE_DIRECTIVE_REGEX, logger: createLogger() });
        const result = callTransform(plugin, "export const x = 1;", "/path/file.js");

        expect(result).toBeUndefined();
    });

    it("should respect include filter", () => {
        expect.assertions(1);

        const plugin = preserveDirectivesPlugin({ directiveRegex: USE_DIRECTIVE_REGEX, include: INCLUDE_TSX_REGEX, logger: createLogger() });
        const result = callTransform(plugin, "'use client';\nexport const x = 1;", "/path/file.js");

        // file.js is NOT included → handler returns undefined early
        expect(result).toBeUndefined();
    });

    it("should strip a shebang without parsing the (possibly invalid) body", () => {
        expect.assertions(3);

        // The transform hook uses a lightweight prologue scan (NOT `this.parse`)
        // so it runs under rolldown too. A shebang followed by syntactically
        // invalid code must still have its shebang captured/stripped, and the hook
        // must NOT emit a PARSE_ERROR (it never parses).
        const plugin = preserveDirectivesPlugin({ directiveRegex: USE_DIRECTIVE_REGEX, logger: createLogger() });
        const warn = vi.fn();
        const result = callTransform(plugin, "#!/usr/bin/env node\n@@@", "/path/file.js", { warn });

        expect(result?.meta.preserveDirectives.shebang).toBe("#!/usr/bin/env node");
        expect(result?.code).not.toContain("#!");
        expect(warn).not.toHaveBeenCalled();
    });

    it("should suppress MODULE_LEVEL_DIRECTIVE rollup warnings for preserved directives", () => {
        expect.assertions(1);

        const plugin = preserveDirectivesPlugin({ directiveRegex: USE_DIRECTIVE_REGEX, logger: createLogger() });
        const onLog = plugin.onLog as (level: string, log: { code: string; message?: string }) => boolean | undefined;
        // Rollup's MODULE_LEVEL_DIRECTIVE message embeds the offending directive in quotes.
        const handled = onLog("warn", { code: "MODULE_LEVEL_DIRECTIVE", message: `Module level directive "use client" in "x.js" was ignored.` });

        expect(handled).toBe(false);
    });

    it("should NOT suppress MODULE_LEVEL_DIRECTIVE warnings for directives it does not preserve", () => {
        expect.assertions(1);

        const plugin = preserveDirectivesPlugin({ directiveRegex: USE_DIRECTIVE_REGEX, logger: createLogger() });
        const onLog = plugin.onLog as (level: string, log: { code: string; message?: string }) => boolean | undefined;
        // A non-`use` directive is not matched by the directiveRegex → must warn as usual.
        const handled = onLog("warn", { code: "MODULE_LEVEL_DIRECTIVE", message: `Module level directive "ngInject" in "x.js" was ignored.` });

        expect(handled).toBeUndefined();
    });

    it("should pass other rollup warnings through (return undefined) from onLog", () => {
        expect.assertions(2);

        const plugin = preserveDirectivesPlugin({ directiveRegex: USE_DIRECTIVE_REGEX, logger: createLogger() });
        const onLog = plugin.onLog as (level: string, log: { code: string; message?: string }) => boolean | undefined;

        // Different code at warn level → fall through.
        expect(onLog("warn", { code: "OTHER_WARNING" })).toBeUndefined();
        // MODULE_LEVEL_DIRECTIVE but at a non-warn level → fall through.
        expect(onLog("info", { code: "MODULE_LEVEL_DIRECTIVE", message: `Module level directive "use client" was ignored.` })).toBeUndefined();
    });

    it("should merge multiple distinct directives from a single module into one set", () => {
        expect.assertions(2);

        const plugin = preserveDirectivesPlugin({ directiveRegex: USE_DIRECTIVE_REGEX, logger: createLogger() });
        const code = "'use client';\n'use server';\nexport const x = 1;";
        const result = callTransform(plugin, code, "/path/a.js");

        // Both directives end up in the per-module set; renderChunk emits both prepended to the chunk.
        expect(result?.meta.preserveDirectives.directives).toStrictEqual(expect.arrayContaining(["use client", "use server"]));

        const chunk = callRenderChunk(plugin, "export const x = 1;\n", { fileName: "out.js", moduleIds: ["/path/a.js"] }, { sourcemap: false });

        expect(chunk?.code).toMatch(USE_CLIENT_SERVER_REGEX);
    });

    it("should prepend collected directives to the chunk", () => {
        expect.assertions(1);

        const plugin = preserveDirectivesPlugin({ directiveRegex: USE_DIRECTIVE_REGEX, logger: createLogger() });

        callTransform(plugin, "'use client';\nexport const x = 1;", "/path/a.js");

        const result = callRenderChunk(plugin, "export const x = 1;\n", { fileName: "out.js", moduleIds: ["/path/a.js"] }, { sourcemap: false });

        expect(result?.code).toMatch(LEADING_USE_CLIENT_REGEX);
    });

    it("should prepend a captured shebang to the entry chunk", () => {
        expect.assertions(1);

        const plugin = preserveDirectivesPlugin({ directiveRegex: USE_DIRECTIVE_REGEX, logger: createLogger() });

        callTransform(plugin, "#!/usr/bin/env node\nexport const x = 1;", "/path/cli.js");

        const result = callRenderChunk(
            plugin,
            "export const x = 1;\n",
            { facadeModuleId: "/path/cli.js", fileName: "cli.js", moduleIds: ["/path/cli.js"] },
            { sourcemap: false },
        );

        expect(result?.code).toMatch(LEADING_SHEBANG_REGEX);
    });

    it("should return undefined from renderChunk when nothing was collected", () => {
        expect.assertions(1);

        const plugin = preserveDirectivesPlugin({ directiveRegex: USE_DIRECTIVE_REGEX, logger: createLogger() });
        const result = callRenderChunk(plugin, "export const x = 1;\n", { fileName: "out.js", moduleIds: ["/path/clean.js"] }, { sourcemap: false });

        expect(result).toBeUndefined();
    });

    it("should NOT retain a directive across a watch rebuild when the second transform drops it", () => {
        expect.assertions(3);

        const plugin = preserveDirectivesPlugin({ directiveRegex: USE_DIRECTIVE_REGEX, logger: createLogger() });

        // First build: module has `"use client"`.
        const first = callTransform(plugin, "'use client';\nexport const x = 1;", "/path/a.js");

        expect(first?.meta.preserveDirectives.directives).toContain("use client");

        // Watch rebuild: the SAME module no longer declares the directive. The
        // closure state for this id must be reset so the directive is not
        // re-emitted from stale state.
        const second = callTransform(plugin, "export const x = 2;", "/path/a.js");

        expect(second).toBeUndefined();

        // renderChunk (with an empty meta side-channel) must not hoist a stale
        // `"use client"` for this chunk.
        const chunk = callRenderChunk(plugin, "export const x = 2;\n", { fileName: "out.js", moduleIds: ["/path/a.js"] }, { sourcemap: false });

        expect(chunk).toBeUndefined();
    });

    it("should recover directives from persisted meta on a transform cache hit (empty side-channel)", () => {
        expect.assertions(1);

        // No callTransform → the in-memory side-channel stays empty, simulating a
        // warm rebuild where transform was served from cache. Directives must be
        // recovered from `meta.preserveDirectives` via getModuleInfo.
        const plugin = preserveDirectivesPlugin({ directiveRegex: USE_DIRECTIVE_REGEX, logger: createLogger() });
        const moduleInfo: Record<string, { meta: Record<string, unknown> }> = {
            "/path/a.js": { meta: { preserveDirectives: { directives: ["use client"] } } },
        };
        const getModuleInfo = (id: string) => moduleInfo[id];

        const result = callRenderChunk(plugin, "export const x = 1;\n", { fileName: "out.js", moduleIds: ["/path/a.js"] }, { sourcemap: false }, getModuleInfo);

        expect(result?.code).toMatch(LEADING_USE_CLIENT_REGEX);
    });
});
