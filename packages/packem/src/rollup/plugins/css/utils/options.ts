import type { Plugin, Transformer } from "postcss";
import type Processor from "postcss/lib/processor";
import type { Result } from "postcss-load-config";

import type { LoaderContext } from "../loaders/types";
import type { InternalStyleOptions, StyleOptions } from "../types";
import arrayFmt from "./array-fmt";
import loadModule from "./load-module";

interface Mode {
    emit: InternalStyleOptions["emit"];
    extract: InternalStyleOptions["extract"];
    inject: InternalStyleOptions["inject"];
}

const modes = ["inject", "extract", "emit"];
const modesFmt = arrayFmt(modes);

type PCSSOption = "parser" | "plugin" | "stringifier" | "syntax";

export const inferModeOption = (mode: StyleOptions["mode"]): Mode => {
    const m = Array.isArray(mode) ? mode : ([mode] as const);

    if (m[0] && !modes.includes(m[0])) {
        throw new Error(`Incorrect mode provided, allowed modes are ${modesFmt}`);
    }

    return {
        emit: m[0] === "emit",
        extract: m[0] === "extract" && (m[1] ?? true),
        inject: (!m[0] || m[0] === "inject") && (m[1] ?? true),
    };
};

export const inferOption = <T, TDefine extends T | boolean>(option: T | boolean | undefined, defaultValue: TDefine): T | TDefine | false => {
    if (typeof option === "boolean") {
        return option && ({} as TDefine);
    }

    if (typeof option === "object") {
        return option;
    }

    return defaultValue;
};

export const inferSourceMapOption = (sourceMap: StyleOptions["sourceMap"]): LoaderContext["sourceMap"] => {
    const sm = Array.isArray(sourceMap) ? sourceMap : ([sourceMap] as const);

    if (!sm[0]) {
        return false;
    }

    return { content: true, ...sm[1], inline: sm[0] === "inline" };
};

export const inferHandlerOption = <T extends { alias?: Record<string, string> }>(option: T | boolean | undefined, alias: T["alias"]): T | false => {
    const opt = inferOption(option, {} as T);

    if (alias && typeof opt === "object" && !opt.alias) {
        opt.alias = alias;
    }

    return opt;
};

export const ensurePCSSOption = async <T>(option: T | string, type: PCSSOption, cwd: string): Promise<T> => {
    if (typeof option !== "string") {
        return option;
    }

    const module = await loadModule(option, cwd);

    if (!module) {
        throw new Error(`Unable to load PostCSS ${type} \`${option}\``);
    }

    return module as T;
};

export const ensurePCSSPlugins = async (plugins: undefined | (Plugin | Transformer | Processor)[]): Promise<Result["plugins"]> => {
    if (plugins === undefined) {
        return [];
    }

    if (plugins.length === 0) {
        return [];
    }

    const ps: Result["plugins"] = [];

    for await (const plugin of plugins.filter(Boolean)) {
        if (!Array.isArray(plugin)) {
            ps.push(await ensurePCSSOption(plugin, "plugin"));

            // eslint-disable-next-line no-continue
            continue;
        }

        const [plug, options] = plugin;

        if (options) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ps.push((await ensurePCSSOption<any>(plug, "plugin"))(options));
        } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ps.push(await ensurePCSSOption<any>(plug, "plugin"));
        }
    }

    return ps;
};
