const cssLoaderDependencies: Record<string, string[]> = {
    less: ["less"],
    lightningcss: ["lightningcss"],
    "node-sass": ["node-sass"],
    postcss: [
        "postcss",
        "postcss-load-config",
        "postcss-modules-extract-imports",
        "postcss-modules-local-by-default",
        "postcss-modules-scope",
        "postcss-modules-values",
        "postcss-value-parser",
        "@csstools/css-parser-algorithms",
        "@csstools/css-tokenizer",
        "@csstools/postcss-slow-plugins",
        "icss-utils",
    ],
    sass: ["sass"],
    "sass-embedded": ["sass-embedded"],
    stylus: ["stylus"],
};

export default cssLoaderDependencies;
