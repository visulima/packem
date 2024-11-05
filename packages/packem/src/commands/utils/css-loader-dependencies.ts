const cssLoaderDependencies = {
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
        "icss-utils",
    ],
    sass: ["sass"],
    "sass-embedded": ["sass-embedded"],
    stylus: ["stylus"],
};

export default cssLoaderDependencies;
