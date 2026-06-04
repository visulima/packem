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
 * @param [options.insertAt] Where to insert the style tag - number for index, 'first'/'last' for position, or object with 'before' selector. A negative number counts from the end and resolves to position `children.length + insertAt + 1`, so `-1` appends at the very end (after the last child) and `-2` inserts before the last child.
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
        const store = (globalThis[SSR_INJECT_ID] ??= []);

        if (options.id && store.some((entry) => entry.id === options.id)) {
            return;
        }

        store.push({ css, id: options.id });

        return;
    }

    if (options.id && document.getElementById(options.id)) {
        return;
    }

    const singleTag = options.singleTag === true;
    const insertAt = options.insertAt ?? "last";

    const container
        = typeof options.container === "string"
            ? (document.querySelector(options.container) as HTMLElement | undefined)
            // Prefer the native `document.head` (fast path in real browsers); fall back to
            // a `head` lookup for environments/test doubles where `document.head` is absent.
            : ((document.head ?? document.querySelectorAll("head")[0]) as HTMLElement | undefined);

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
            // Reserved attributes are controlled by dedicated options (id, type, nonce)
            // and must not be silently overridden by a user-supplied attributes map.
            Object.entries(options.attributes).forEach(([key, value]) => {
                if (key === "id" || key === "type" || key === "nonce") {
                    return;
                }

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
            const { children } = container;
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

        return styleTag;
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
        const insertKey = typeof insertAt === "object" ? `before_${insertAt.before}` : String(insertAt);

        const tagsForId = styleTags[id] as Record<string, HTMLStyleElement>;

        tagsForId[insertKey] ??= createStyleTag();

        styleTag = tagsForId[insertKey];
    } else {
        styleTag = createStyleTag();
    }

    if (options.nonce) {
        styleTag.setAttribute("nonce", options.nonce);
    }

    // Legacy IE support: styleSheet is non-standard and not in lib.dom types
    const legacyStyleSheet = (styleTag as HTMLStyleElement & { styleSheet?: { cssText: string } }).styleSheet;

    if (legacyStyleSheet && typeof legacyStyleSheet.cssText === "string") {
        legacyStyleSheet.cssText += css;
    } else {
        styleTag.append(document.createTextNode(css));
    }
};
