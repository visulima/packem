interface SSRInjectData {
    css: string;
    id?: string;
}

declare global {
    // eslint-disable-next-line vars-on-top, no-underscore-dangle, @typescript-eslint/naming-convention
    var __styleInject_SSR_MODULES: SSRInjectData[] | undefined;
}

/** @type {HTMLElement[]} */
const containers: (Element | undefined)[] = [];
/** @type {Record<string, HTMLStyleElement>[]} */
const styleTags: Record<string, HTMLStyleElement>[] = [];

export const SSR_INJECT_ID = "__styleInject_SSR_MODULES";

/**
 * @param css The CSS string to inject
 * @param options Configuration options
 * @param [options.id] Unique identifier for the style tag
 * @param [options.insertAt] Where to insert the style tag - number for index, 'first'/'last' for position, or object with 'before' selector
 * @param [options.singleTag] Whether to reuse a single style tag
 * @param [options.container] CSS selector for the container element
 * @param [options.attributes] Additional attributes to set on the style tag
 * @param [options.nonce] Nonce value for CSP compliance
 */
export const cssStyleInject = (
    css: string,
    options: {
        attributes?: Record<string, string>;
        container?: string;
        id?: string;
        insertAt?: number | "first" | "last" | { before: string };
        nonce?: string;
        singleTag?: boolean;
    } = {},
// eslint-disable-next-line sonarjs/cognitive-complexity
): void => {
    if (!css) {
        return;
    }

    if (typeof document === "undefined") {
        if (globalThis) {
            globalThis[SSR_INJECT_ID] = globalThis[SSR_INJECT_ID] || [];
            globalThis[SSR_INJECT_ID].push({ css, id: options.id });
        }

        return;
    }

    if (options.id && document.querySelector(`#${options.id}`)) {
        return;
    }

    const singleTag = options.singleTag === true;
    const insertAt = options.insertAt ?? "last";

    const container
        = typeof options.container === "string" ? (document.querySelector(options.container) as HTMLElement | undefined) : document.querySelectorAll("head")[0];

    if (!container) {
        throw new Error("Unable to find container element");
    }

    // eslint-disable-next-line sonarjs/cognitive-complexity
    const createStyleTag = () => {
        const styleTag = document.createElement("style");

        styleTag.setAttribute("type", "text/css");

        if (options.id) {
            styleTag.setAttribute("id", options.id);
        }

        if (options.attributes) {
            Object.entries(options.attributes).forEach(([key, value]) => {
                styleTag.setAttribute(key, value);
            });
        }

        // Handle different insertAt options
        if (typeof insertAt === "object" && "before" in insertAt) {
            // Insert before a specific element
            const targetElement = container.querySelector(insertAt.before);

            if (targetElement) {
                targetElement.before(styleTag);
            } else {
                // Fallback to last position if target element not found
                container.append(styleTag);
            }
        } else if (typeof insertAt === "number") {
            // Insert at specific index
            const children = [...container.children];
            const index = insertAt < 0 ? Math.max(0, children.length + insertAt + 1) : insertAt;

            if (index <= 0) {
                container.prepend(styleTag);
            } else if (index >= children.length) {
                container.append(styleTag);
            } else if (children[index]) {
                children[index].before(styleTag);
            }
        } else if (insertAt === "first") {
            // Insert as first child
            container.prepend(styleTag);
        } else {
            // Insert as last child (default)
            container.append(styleTag);
        }

        return styleTag as HTMLStyleElement;
    };

    /** @type {HTMLStyleElement} */
    let styleTag;

    if (singleTag) {
        let id = containers.indexOf(container);

        if (id === -1) {
            id = containers.push(container) - 1;

            styleTags[id] = {};
        }

        // Create a key based on insertAt for caching
        const insertKey = typeof insertAt === "object" ? `before_${insertAt.before}` : insertAt;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (!(styleTags[id] as any)[insertKey]) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (styleTags[id] as any)[insertKey] = createStyleTag();
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        styleTag = (styleTags[id] as any)[insertKey];
    } else {
        styleTag = createStyleTag();
    }

    if (options.nonce) {
        styleTag.setAttribute("nonce", options.nonce);
    }

    if (styleTag.styleSheet && typeof styleTag.styleSheet.cssText === "string") {
        styleTag.styleSheet.cssText += css;
    } else {
        styleTag.append(document.createTextNode(css));
    }
};
