interface SSRInjectData {
    css: string;
    id?: string;
}

declare global {
    // eslint-disable-next-line vars-on-top, no-underscore-dangle, @typescript-eslint/naming-convention
    var __styleInject_SSR_MODULES: SSRInjectData[] | undefined;
}

// Caches the reused style tags for `singleTag` injections, keyed by the
// container element. A WeakMap lets removed containers (and their style tags)
// be garbage-collected, and gives O(1) lookup per call.
const singleTagCache = new WeakMap<Element, Record<string, HTMLStyleElement>>();

// Matches event-handler attribute names (`on*`, e.g. `onload`). Module-scoped so
// it is compiled once rather than on every attribute iteration.
const RE_EVENT_HANDLER_ATTRIBUTE = /^on/i;

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
        globalThis[SSR_INJECT_ID] ??= [];

        const store = globalThis[SSR_INJECT_ID];

        if (options.id && store.some((entry) => entry.id === options.id)) {
            return;
        }

        store.push({ css, id: options.id });

        return;
    }

    // eslint-disable-next-line unicorn/prefer-query-selector -- getElementById is intentional: querySelector(`#${id}`) throws on ids that aren't valid CSS identifiers (the crash this dedup fixes).
    if (options.id && document.getElementById(options.id)) {
        return;
    }

    const singleTag = options.singleTag === true;
    const insertAt = options.insertAt ?? "last";

    const container =
        typeof options.container === "string"
            ? document.querySelector<HTMLElement>(options.container)
            : // Prefer the native `document.head` (fast path in real browsers); fall back to
              // a `head` lookup for environments/test doubles where `document.head` is absent.
              // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- lib.dom types `document.head` as non-null, but it is genuinely absent in SSR/test-double environments; the fallback is load-bearing.
              ((document.head ?? document.querySelectorAll("head")[0]) as HTMLElement | undefined);

    if (!container) {
        throw new Error(`Unable to find container element${options.container ? ` matching selector "${options.container}"` : ""}`);
    }

    // eslint-disable-next-line sonarjs/cognitive-complexity
    const createStyleTag = () => {
        const styleTag = document.createElement("style");

        if (options.id) {
            styleTag.setAttribute("id", options.id);
        }

        if (options.attributes) {
            // Reserved attributes are controlled by dedicated options (id, type, nonce)
            // and must not be silently overridden by a user-supplied attributes map.
            // Event-handler attributes (on*, e.g. onload) are rejected so the
            // attributes map can never create an executable handler.
            Object.entries(options.attributes).forEach(([key, value]) => {
                if (key === "id" || key === "type" || key === "nonce" || RE_EVENT_HANDLER_ATTRIBUTE.test(key)) {
                    return;
                }

                styleTag.setAttribute(key, value);
            });
        }

        // Handle different insertAt options
        if (typeof insertAt === "object" && "before" in insertAt) {
            // Insert before a specific element
            let targetElement: Element | null;

            try {
                targetElement = container.querySelector(insertAt.before);
            } catch (error) {
                throw new Error(`Invalid selector for the \`insertAt.before\` option: "${insertAt.before}"`, { cause: error });
            }

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

    let styleTag: HTMLStyleElement;

    if (singleTag) {
        let tagsForContainer = singleTagCache.get(container);

        if (!tagsForContainer) {
            tagsForContainer = {};
            singleTagCache.set(container, tagsForContainer);
        }

        // Create a key based on insertAt for caching
        const insertKey = typeof insertAt === "object" ? `before_${insertAt.before}` : String(insertAt);

        tagsForContainer[insertKey] ??= createStyleTag();

        styleTag = tagsForContainer[insertKey];
    } else {
        styleTag = createStyleTag();
    }

    if (options.nonce) {
        // Set the nonce via the IDL property rather than `setAttribute("nonce", ...)`.
        // Browsers enforce CSP using the property, and (unlike a script-set attribute)
        // it is not reflected into a readable DOM attribute, preventing CSS-based
        // exfiltration of the nonce. Fall back to the attribute only where the
        // property is unavailable (lib.dom types `nonce` as always present, so the
        // runtime guard is cast to keep the fallback for older/partial DOM doubles).
        if ("nonce" in styleTag) {
            styleTag.nonce = options.nonce;
        } else {
            (styleTag as HTMLStyleElement).setAttribute("nonce", options.nonce);
        }
    }

    styleTag.append(document.createTextNode(css));
};
