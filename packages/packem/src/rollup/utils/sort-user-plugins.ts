import type { RollupPlugins } from "../../types";
import type { Plugin } from "rollup";

const sortUserPlugins = (plugins: RollupPlugins | undefined, type: "build" | "dts"): [Plugin[], Plugin[], Plugin[]] => {
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
