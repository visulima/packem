/**
 * Rules the workspace deliberately does not enforce, in one place so the eight package
 * configs cannot drift apart. Everything here is a style or naming opinion that this
 * codebase has never followed; nothing that reports a defect is switched off.
 *
 * Adopting any of these is a code change of its own — delete the entry, run
 * `pnpm run lint:eslint:fix`, and fix what is left by hand.
 * @type {import("eslint").Linter.Config}
 */
const houseRules = {
    name: "packem/house-rules",
    rules: {
        // Formatting the shared config's `stylistic: false` switch does not reach. prettier
        // owns line breaks here, and these rules undo what it does (and vice versa).
        "antfu/consistent-chaining": "off",
        "antfu/consistent-list-newline": "off",
        "antfu/if-newline": "off",

        // `__tests__`, `__fixtures__` and `__bench__` are the conventional directory names
        // for vitest fixtures and suites; kebab-case would break every tooling assumption.
        "unicorn/filename-case": [
            "error",
            {
                cases: { kebabCase: true },
                ignore: [/^__[a-z]+__$/u],
            },
        ],

        // Naming opinions. The option names are part of the public API surface
        // (`sideEffect`, `allowFail`, `subDirectory`), so renaming them is a breaking change,
        // not a lint fix.
        "unicorn/consistent-boolean-name": "off",
        "unicorn/consistent-compound-words": "off",
        "unicorn/name-replacements": "off",
        "unicorn/no-non-function-verb-prefix": "off",

        // Rollup and rolldown invoke plugin hooks with the PluginContext as `this`, and the
        // hooks are object methods by design — that is the plugin API, not a class.
        "unicorn/no-this-outside-of-class": "off",

        // Control-flow and expression shape. The AST transforms in this workspace are written
        // as explicit loops and guards on purpose; these rules would rewrite them into forms
        // that read worse at the sizes involved.
        "unicorn/max-nested-calls": "off",
        "unicorn/no-break-in-nested-loop": "off",
        "unicorn/no-declarations-before-early-exit": "off",
        "unicorn/no-duplicate-loops": "off",
        "unicorn/no-top-level-assignment-in-function": "off",
        "unicorn/no-unreadable-for-of-expression": "off",
        "unicorn/prefer-else-if": "off",
        "unicorn/prefer-hoisting-branch-code": "off",
        "unicorn/prefer-minimal-ternary": "off",
        "unicorn/prefer-simple-condition-first": "off",
        "unicorn/prefer-ternary": "off",
        "unicorn/prefer-type-literal-last": "off",

        // Iteration and API-shape preferences that would churn hot paths for no measurable
        // gain — the transforms iterate arrays that are already materialised.
        "unicorn/better-dom-traversing": "off",
        "unicorn/no-array-from-fill": "off",
        "unicorn/no-computed-property-existence-check": "off",
        "unicorn/prefer-await": "off",
        "unicorn/prefer-includes-over-repeated-comparisons": "off",
        "unicorn/prefer-iterator-helpers": "off",
        "unicorn/prefer-iterator-to-array": "off",
        "unicorn/prefer-number-coercion": "off",
        "unicorn/prefer-number-is-safe-integer": "off",
        "unicorn/prefer-object-iterable-methods": "off",

        // Member ordering. Reshuffling method bodies to satisfy an ordering opinion is
        // pure churn in files that group members by what they do.
        "unicorn/consistent-class-member-order": "off",

        // `Array.fromAsync` is ES2024 and the workspace compiles against the ES2023 lib,
        // so the suggested rewrite does not typecheck.
        "unicorn/prefer-array-from-async": "off",

        // These flag `String#replace` with a string pattern. Every hit here replaces a marker
        // that occurs once by construction, and the transforms rely on that.
        "unicorn/no-unsafe-string-replacement": "off",
    },
};

export default houseRules;
