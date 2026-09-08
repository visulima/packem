import type { ExeArch, ExePlatform, ExeTarget } from "./platform";

/** Tokens accepted inside `exe.fileName`, e.g. `"[name]-[platform]-[arch]"`. */
interface FileNameTokens {
    arch: ExeArch;
    /** Base name of the bundled entry, without its extension. */
    name: string;
    /** Exact Node.js version embedded into the executable, e.g. `"25.7.0"`. */
    node: string;
    platform: ExePlatform;
    /** `version` field of the project's `package.json`, or an empty string. */
    version: string;
}

const TOKEN_PATTERN = /\[(arch|name|node|platform|version)\]/g;

/** Default naming when a single executable is produced. */
const SINGLE_TARGET_TEMPLATE = "[name]";

/** Default naming when several targets are built, so the files do not overwrite each other. */
const MULTI_TARGET_TEMPLATE = "[name]-[platform]-[arch]";

/**
 * Reports whether a template string contains at least one `[token]`.
 *
 * A literal `fileName` (no tokens) that is used for several targets would have every
 * target overwrite the previous one, so callers append a platform suffix in that case.
 * @param template The configured file name.
 * @returns `true` when the template interpolates at least one token.
 */
const hasTokens = (template: string): boolean => {
    TOKEN_PATTERN.lastIndex = 0;

    return TOKEN_PATTERN.test(template);
};

/**
 * Replaces every `[token]` in a file-name template with its value.
 * @param template The template, e.g. `"[name]-[platform]-[arch]"`.
 * @param tokens The values to interpolate.
 * @returns The interpolated name, without a file extension.
 */
const applyTokens = (template: string, tokens: FileNameTokens): string =>
    template.replaceAll(TOKEN_PATTERN, (_match, token: keyof FileNameTokens) => tokens[token]);

/**
 * Returns the platform-appropriate suffix for a target, e.g. `"-win-x64"`.
 * @param target The resolved target.
 * @returns The suffix, including its leading dash.
 */
const getTargetSuffix = (target: ExeTarget): string => `-${target.platform}-${target.arch}`;

interface BuildFileNameOptions {
    /** Whether more than one executable is produced by this build. */
    multiple: boolean;
    /** The configured `exe.fileName`, already narrowed to a string. */
    template?: string;
    tokens: FileNameTokens;
}

/**
 * Produces the final output file name for one executable.
 *
 * When no template is configured, `[name]` is used for a single-output build and
 * `[name]-[platform]-[arch]` when several executables are produced. A configured
 * template without tokens still gets a platform suffix in multi-output builds so the
 * files remain distinct. `.exe` is appended for Windows targets.
 * @param options The template, its token values, and whether the build is multi-output.
 * @returns The file name including the extension where one applies.
 */
const buildFileName = (options: BuildFileNameOptions): string => {
    const { multiple, template, tokens } = options;

    let baseName: string;

    if (template === undefined) {
        baseName = applyTokens(multiple ? MULTI_TARGET_TEMPLATE : SINGLE_TARGET_TEMPLATE, tokens);
    } else if (hasTokens(template)) {
        baseName = applyTokens(template, tokens);
    } else {
        baseName = multiple ? `${template}-${tokens.platform}-${tokens.arch}` : template;
    }

    if (baseName === "") {
        throw new Error(`The \`exe.fileName\` template ${JSON.stringify(template)} produced an empty file name.`);
    }

    return tokens.platform === "win" ? `${baseName}.exe` : baseName;
};

export type { BuildFileNameOptions, FileNameTokens };
export { applyTokens, buildFileName, getTargetSuffix, hasTokens, MULTI_TARGET_TEMPLATE, SINGLE_TARGET_TEMPLATE };
