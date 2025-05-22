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

    const container =
        typeof options.container === "string" ? (document.querySelector(options.container) as HTMLElement | null) : document.querySelectorAll("head")[0];

    if (!container) {
        throw new Error("Unable to find container element");
    }

    const createStyleTag = () => {
        const styleTag = document.createElement("style");

        styleTag.setAttribute("type", "text/css");

        if (options.attributes) {
            Object.entries(options.attributes).forEach(([key, value]) => {
                styleTag.setAttribute(key, value);
            });
        }

        const pos = position === "prepend" ? "afterbegin" : "beforeend";

        container.insertAdjacentElement(pos, styleTag);

        return styleTag as HTMLStyleElement;
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
        if (!(styleTags[id] as any)[position]) {
            // eslint-disable-next-line security/detect-object-injection,@typescript-eslint/no-explicit-any
            (styleTags[id] as any)[position] = createStyleTag();
        }

        // eslint-disable-next-line security/detect-object-injection,@typescript-eslint/no-explicit-any
        styleTag = (styleTags[id] as any)[position];
    } else {
        styleTag = createStyleTag();
    }

    if (styleTag.styleSheet) {
        styleTag.styleSheet.cssText += css;
    } else {
        styleTag.append(document.createTextNode(css));
    }
};
