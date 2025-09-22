import type { Plugin } from "rollup";

/**
 * Sorts user plugins into pre, normal, and post execution order based on their enforcement settings.
 * @param plugins Array of plugins to sort, can be undefined
 * @param type The build type to filter plugins for ("build" or "dts")
 * @returns A tuple containing [prePlugins, normalPlugins, postPlugins] arrays
 */
const sortUserPlugins = <T extends { enforce?: "pre" | "post"; plugin: Plugin; type?: string }>(
    plugins: T[] | undefined,
    type: "build" | "dts",
): [Plugin[], Plugin[], Plugin[]] => {
    const prePlugins: Plugin[] = [];
    const postPlugins: Plugin[] = [];
    const normalPlugins: Plugin[] = [];

    if (plugins) {
        plugins
            .filter(Boolean)
            .filter((p) => {
                if (p.type === type) {
                    return true;
                }

                return type === "build" && p.type === undefined;
            })
            .forEach((p) => {
                if (p.enforce === "pre") {
                    prePlugins.push(p.plugin);
                } else if (p.enforce === "post") {
                    postPlugins.push(p.plugin);
                } else {
                    normalPlugins.push(p.plugin);
                }
            });
    }

    return [prePlugins, normalPlugins, postPlugins];
};

export default sortUserPlugins;
