/** @type {HTMLElement[]} */
const containers: (Element | null)[] = [];
/** @type {{prepend:HTMLStyleElement,append:HTMLStyleElement}[]} */
const styleTags: Record<string, Record<"prepend" | "append", HTMLStyleElement>>[] = [];

/**
 * @param {string} css
 * @param {object} options
 * @param {boolean} [options.prepend]
 * @param {boolean} [options.singleTag]
 * @param {string} [options.container]
 * @param {Record<string,string>} [options.attributes]
 * @returns {void}
 */
// eslint-disable-next-line import/no-unused-modules
export default (
    css: string,
    options: {
        attributes?: Record<string, string>;
        container?: string;
        prepend?: boolean;
        singleTag?: boolean;
    },
    // eslint-disable-next-line sonarjs/cognitive-complexity
): void => {
    if (!css || typeof document === "undefined") {
        return;
    }

    const position = options.prepend === true ? "prepend" : "append";
    const singleTag = options.singleTag === true;

    const container = typeof options.container === "string" ? document.querySelector(options.container) : document.querySelectorAll("head")[0];

    const createStyleTag = () => {
        const styleTag = document.createElement("style");

        styleTag.setAttribute("type", "text/css");

        if (options.attributes) {
            const k = Object.keys(options.attributes);

            for (const element of k) {
                // eslint-disable-next-line security/detect-object-injection
                styleTag.setAttribute(element, options.attributes[element]);
            }
        }

        if (typeof __webpack_nonce__ !== "undefined") {
            styleTag.setAttribute("nonce", __webpack_nonce__);
        }

        const pos = position === "prepend" ? "afterbegin" : "beforeend";

        container.insertAdjacentElement(pos, styleTag);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return styleTag;
    };

    /** @type {HTMLStyleElement} */
    let styleTag;

    if (singleTag) {
        let id = containers.indexOf(container);

        if (id === -1) {
            id = containers.push(container) - 1;

            // eslint-disable-next-line security/detect-object-injection
            styleTags[id] = {};
        }

        // eslint-disable-next-line security/detect-object-injection,@typescript-eslint/no-explicit-any
        styleTag = styleTags[id]?.[position] ?? ((styleTags[id] as any)[position] = createStyleTag());
    } else {
        styleTag = createStyleTag();
    }

    // strip potential UTF-8 BOM if css was read from a file
    if (css.codePointAt(0) === 0xfe_ff) {
        // eslint-disable-next-line no-param-reassign
        css = css.slice(1);
    }

    if (styleTag.styleSheet) {
        // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
        styleTag.styleSheet.cssText += css;
    } else {
        styleTag.append(document.createTextNode(css));
    }
};
