import type { PluginCreator } from "postcss";

/**
 * No-operation PostCSS plugin used as a fallback when no other plugins are configured.
 *
 * This plugin prevents PostCSS from showing warnings about running without any plugins.
 * It performs no transformations on the CSS - it simply ensures PostCSS has at least
 * one plugin to execute, which is required for proper PostCSS operation.
 *
 * The plugin is automatically added when:
 * - No user plugins are configured
 * - No config file plugins are found
 * - No built-in plugins (import, url, modules) are enabled
 * @example
 * ```typescript
 * // Used internally when plugins array is empty
 * if (plugins.length === 0) {
 *   plugins.push(postcssNoop);
 * }
 * ```
 */
const postcssNoop: PluginCreator<unknown> = () => {
    return {
        /** Plugin name for identification in PostCSS pipeline */
        postcssPlugin: "css-noop",

        /** Version requirement for PostCSS compatibility */
        prepare: () => {
            return {};
        },
    };
};

// Mark as PostCSS 8 compatible
postcssNoop.postcss = true;

export default postcssNoop;
