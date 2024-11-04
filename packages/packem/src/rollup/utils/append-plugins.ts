import type { InputPluginOption, Plugin } from "rollup";

import type { RollupPlugins } from "../../types";

const appendPlugin = (plugins: InputPluginOption[], newPlugin: Plugin, targetPluginName: string, appendAfter: boolean): InputPluginOption[] => {
    const targetIndex = plugins.findIndex((plugin) => {
        if (typeof plugin === "object") {
            return (plugin as Plugin).name === targetPluginName;
        }

        return false;
    });

    if (targetIndex === -1) {
        throw new Error(
            `Plugin with name "${targetPluginName}" was not found, try one of: ${plugins
                .map((plugin) => {
                    if (typeof plugin === "object") {
                        return (plugin as Plugin).name;
                    }

                    return undefined;
                })
                .filter(Boolean)
                .join(", ")}`,
        );
    }

    const insertIndex = appendAfter ? targetIndex + 1 : targetIndex;

    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    plugins.splice(insertIndex, 0, newPlugin);

    return plugins;
};

const appendPlugins = (plugins: InputPluginOption[], newPlugins: RollupPlugins | undefined): InputPluginOption[] => {
    if (!newPlugins) {
        return plugins;
    }

    // @ts-expect-error type mismatch
    for (const { after = undefined, before = undefined, plugin } of newPlugins) {
        // eslint-disable-next-line no-param-reassign
        plugins = after ? appendPlugin(plugins, plugin, after, true) : appendPlugin(plugins, plugin, before, false);
    }

    return plugins;
};

export default appendPlugins;
