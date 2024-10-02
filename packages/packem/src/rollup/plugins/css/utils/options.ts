import type { Result } from "postcss-load-config";

import type { LoaderContext } from "../loaders/types";
import type { InternalStyleOptions,StyleOptions } from "../types";
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
}

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

export const ensurePCSSOption = <T>(option: T | string, type: PCSSOption): T => {
    if (typeof option !== "string") {
        return option;
    }

    const module = loadModule(option);

    if (!module) {
        throw new Error(`Unable to load PostCSS ${type} \`${option}\``);
    }

    return module as T;
};

export const ensurePCSSPlugins = (plugins: StyleOptions["postcss"]["plugins"]): Result["plugins"] => {
    if (plugins === undefined) {
        return [];
    }

    if (typeof plugins !== "object") {
        throw new TypeError("`plugins` option must be an array or an object!");
    }

    const ps: Result["plugins"] = [];

    for (const p of Array.isArray(plugins) ? plugins : Object.entries(plugins)) {
        if (!p) {
            // eslint-disable-next-line no-continue
            continue;
        }

        if (!Array.isArray(p)) {
            ps.push(ensurePCSSOption(p, "plugin"));

            continue;
        }

        const [plug, options] = p;

        if (options) {
            ps.push(ensurePCSSOption(plug, "plugin")(options));
        } else {
            ps.push(ensurePCSSOption(plug, "plugin"));
        }
    }

    return ps;
};

export const inferOption = <T, TDefine extends T | boolean>(option: T | boolean | undefined, defaultValue: TDefine): T | TDefine | false => {
    if (typeof option === "boolean") {
        return option && ({} as TDefine);
    }

    if (typeof option === "object") {
        return option;
    }

    return defaultValue;
}
