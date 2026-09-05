/**
 * A lexical scanner for source-phase imports.
 *
 * The rewrite these results feed cannot use an AST: `import source` is a stage 3 proposal
 * that none of the transformers packem drives will parse, which is the whole reason the
 * syntax has to be rewritten before they see it. Matching raw text instead is what makes
 * a scanner necessary — the same characters inside a string, a template literal or a
 * comment are data, and replacing them there would silently corrupt the module.
 *
 * So the source is walked once to mark which characters are actually code, and a match is
 * kept only when it begins in code.
 */

/** Character classes are cheap to test against a set. */
const WHITESPACE = new Set(["\t", "\n", "\v", "\f", "\r", " "]);

/**
 * A `/` after one of these begins a regular expression rather than a division: none of
 * them can end an expression, so an operand has to follow.
 */
const REGEX_PRECEDING_PUNCTUATION = new Set(["!", "%", "&", "(", "*", "+", ",", "-", ":", ";", "<", "=", ">", "?", "[", "^", "{", "|", "}", "~"]);

/** Keywords with the same property: a `/` right after one starts a regular expression. */
const REGEX_PRECEDING_KEYWORDS = new Set([
    "await",
    "case",
    "delete",
    "do",
    "else",
    "in",
    "instanceof",
    "new",
    "of",
    "return",
    "throw",
    "typeof",
    "void",
    "yield",
]);

const IDENTIFIER_PART = /[\w$]/;

/**
 * Decides whether the `/` at `index` opens a regular expression, by looking back at the
 * last significant token. Getting this wrong only ever costs a missed rewrite (the build
 * then fails loudly on the unparsed syntax), never a corrupted string.
 * @param code The source being scanned.
 * @param index Offset of the `/`.
 * @returns `true` when a regular expression starts here.
 */
const startsRegex = (code: string, index: number): boolean => {
    let cursor = index - 1;

    while (cursor >= 0 && WHITESPACE.has(code[cursor] as string)) {
        cursor -= 1;
    }

    if (cursor < 0) {
        return true;
    }

    const character = code[cursor] as string;

    if (REGEX_PRECEDING_PUNCTUATION.has(character)) {
        return true;
    }

    if (!IDENTIFIER_PART.test(character)) {
        return false;
    }

    const end = cursor + 1;

    while (cursor >= 0 && IDENTIFIER_PART.test(code[cursor] as string)) {
        cursor -= 1;
    }

    return REGEX_PRECEDING_KEYWORDS.has(code.slice(cursor + 1, end));
};

/**
 * Walks a module once, marking every character that is real code rather than the body of
 * a string, template literal, regular expression or comment.
 *
 * The scan is deliberately shallow. It never has to understand the grammar — only to know
 * where a literal begins and ends — so an unterminated construct simply runs to the end of
 * the source, the same thing a parser would report on.
 */
class Scanner {
    readonly #code: string;

    readonly #mask: Uint8Array;

    /**
     * Depths at which a template literal was suspended by `${`, so the matching `}` is
     * known to return to the template rather than to close a block.
     */
    readonly #interpolations: number[] = [];

    #braceDepth = 0;

    #index = 0;

    public constructor(code: string) {
        this.#code = code;
        this.#mask = new Uint8Array(code.length);
    }

    /**
     * Runs the scan.
     * @returns A byte per character of the source: `1` for code, `0` otherwise.
     */
    public scan(): Uint8Array {
        while (this.#index < this.#code.length) {
            const character = this.#code[this.#index] as string;
            const next = this.#code[this.#index + 1];

            if (character === "/" && next === "/") {
                this.#skipLineComment();
            } else if (character === "/" && next === "*") {
                this.#skipBlockComment();
            } else if (character === "'" || character === '"') {
                this.#readString(character);
            } else if (character === "`") {
                this.#mark();
                this.#readTemplateBody();
            } else if (character === "/" && startsRegex(this.#code, this.#index)) {
                this.#readRegex();
            } else {
                this.#mark();
                this.#trackBraces(character);
            }
        }

        return this.#mask;
    }

    /** Marks the character under the cursor as code and steps past it. */
    #mark(): void {
        this.#mask[this.#index] = 1;
        this.#index += 1;
    }

    /**
     * Reads a regular expression literal, honouring escapes and character classes.
     */
    #readRegex(): void {
        this.#mark();

        let inCharacterClass = false;

        while (this.#index < this.#code.length) {
            const character = this.#code[this.#index] as string;

            if (character === "\\") {
                this.#index += 2;

                continue;
            }

            if (character === "[") {
                inCharacterClass = true;
            } else if (character === "]") {
                inCharacterClass = false;
            } else if (character === "/" && !inCharacterClass) {
                this.#mark();

                return;
            } else if (character === "\n") {
                // A regular expression cannot span lines, so this `/` was division after
                // all. Bailing out here beats swallowing the rest of the file.
                return;
            }

            this.#index += 1;
        }
    }

    /**
     * Reads a quoted string. The delimiters are code, the body is not.
     * @param quote The opening quote character.
     */
    #readString(quote: string): void {
        this.#mark();

        while (this.#index < this.#code.length && this.#code[this.#index] !== quote) {
            this.#index += this.#code[this.#index] === "\\" ? 2 : 1;
        }

        this.#mark();
    }

    /**
     * Reads a template literal's body, stopping after the closing backtick or after a
     * `${` that suspends it — from that point the source is code again.
     */
    #readTemplateBody(): void {
        while (this.#index < this.#code.length) {
            const character = this.#code[this.#index];

            if (character === "\\") {
                this.#index += 2;

                continue;
            }

            if (character === "`") {
                this.#mark();

                return;
            }

            if (character === "$" && this.#code[this.#index + 1] === "{") {
                this.#mark();
                this.#mark();
                this.#interpolations.push(this.#braceDepth);
                this.#braceDepth += 1;

                return;
            }

            this.#index += 1;
        }
    }

    /**
     * Skips a block comment, including both delimiters.
     */
    #skipBlockComment(): void {
        this.#index += 2;

        while (this.#index < this.#code.length && !(this.#code[this.#index] === "*" && this.#code[this.#index + 1] === "/")) {
            this.#index += 1;
        }

        this.#index += 2;
    }

    /**
     * Skips a `//` comment, up to but not including the terminating newline.
     */
    #skipLineComment(): void {
        while (this.#index < this.#code.length && this.#code[this.#index] !== "\n") {
            this.#index += 1;
        }
    }

    /**
     * Tracks brace nesting, and resumes the template a closing brace hands back to.
     * @param character The character just consumed.
     */
    #trackBraces(character: string): void {
        if (character === "{") {
            this.#braceDepth += 1;

            return;
        }

        if (character !== "}") {
            return;
        }

        this.#braceDepth -= 1;

        if (this.#interpolations.at(-1) === this.#braceDepth) {
            this.#interpolations.pop();
            this.#readTemplateBody();
        }
    }
}

/**
 * Marks every character of `code` that is real code rather than the body of a string,
 * template literal, regular expression or comment.
 * @param code The source to scan.
 * @returns A byte per character: `1` for code, `0` otherwise.
 */
const maskNonCode = (code: string): Uint8Array => new Scanner(code).scan();

/**
 * Matches `import source &lt;binding> from "&lt;specifier>"`.
 *
 * The scan above is what decides whether a hit is real code, so this only has to describe
 * the shape. `\b` keeps it off an identifier that merely ends in `import`; the caller
 * rejects a leading `.` or `$` for the two cases a word boundary does not cover.
 */
const SOURCE_PHASE_IMPORT = /\bimport\s+source\s+([$A-Z_a-z][\w$]*)\s+from\s*(["'])([^"']+)\2/g;

interface SourcePhaseImport {
    /** The local binding the compiled module is bound to. */
    binding: string;

    /** Offset of the `import` keyword, so the declaration can be spliced out exactly. */
    index: number;

    /** The module specifier, as written. */
    specifier: string;

    /** The whole matched declaration. */
    statement: string;
}

/**
 * Finds the source-phase imports in a module, ignoring any that appear inside a string,
 * template literal, regular expression or comment.
 * @param code The module source.
 * @returns One entry per real declaration, in source order.
 */
const findSourcePhaseImports = (code: string): SourcePhaseImport[] => {
    // Cheap bail-out before the scan: the declaration always contains both tokens.
    if (!code.includes("import") || !code.includes("source")) {
        return [];
    }

    const mask = maskNonCode(code);
    const found: SourcePhaseImport[] = [];

    for (const match of code.matchAll(SOURCE_PHASE_IMPORT)) {
        if (mask[match.index] !== 1) {
            continue;
        }

        const previous = match.index > 0 ? (code[match.index - 1] as string) : "";

        // `obj.import` is a property access and `$import` an identifier; a word boundary
        // alone lets both through.
        if (previous === "." || previous === "$") {
            continue;
        }

        found.push({ binding: match[1] as string, index: match.index, specifier: match[3] as string, statement: match[0] });
    }

    return found;
};

export type { SourcePhaseImport };
export { findSourcePhaseImports, maskNonCode };
