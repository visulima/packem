import type { Plugin } from "rollup";

// Note: RollupPlugins type will be imported from the consuming packages
// to avoid circular dependencies in the shared package

const sortUserPlugins = (plugins: any[] | undefined, type: "build" | "dts"): [Plugin[], Plugin[], Plugin[]] => {
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
