import type { PluginCreator } from "postcss";

const name = "css-noop";

const noopPlugin: PluginCreator<unknown> = () => {
    return { postcssPlugin: name };
};

noopPlugin.postcss = true;

export default noopPlugin;
