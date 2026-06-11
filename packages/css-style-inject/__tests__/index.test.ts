/* eslint-disable unicorn/no-null */
/* eslint-disable vitest/require-mock-type-parameters */
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { cssStyleInject, SSR_INJECT_ID } from "../src/index";

// Mock DOM methods
const mockElement: {
    append: Mock;
    before: Mock;
    children: Element[];
    nonce: string | undefined;
    prepend: Mock;
    querySelector: Mock;
    querySelectorAll: Mock;
    setAttribute: Mock;
} = {
    append: vi.fn(),
    before: vi.fn(),
    children: [] as Element[],
    // `"nonce" in styleTag` must be true for the IDL-property path; created
    // elements expose a `nonce` property in real browsers.
    nonce: undefined,
    prepend: vi.fn(),
    querySelector: vi.fn(),
    querySelectorAll: vi.fn(),
    setAttribute: vi.fn(),
};

const mockDocument = {
    // `document.head` is the real fast path; the mock provides it so the
    // default-container test exercises that path rather than the fallback.
    head: mockElement,
    createElement: vi.fn(() => mockElement),
    createTextNode: vi.fn(() => {
        return { nodeType: 3, textContent: "" };
    }),
    getElementById: vi.fn(),
    querySelector: vi.fn(),
    querySelectorAll: vi.fn(() => [mockElement]),
};

// eslint-disable-next-line vitest/require-top-level-describe
beforeEach(() => {
    vi.clearAllMocks();
    mockElement.children = [];
    mockElement.nonce = undefined;
    mockDocument.head = mockElement;

    // Reset global document
    Object.defineProperty(globalThis, "document", {
        value: mockDocument,
        writable: true,
    });

    // Reset global SSR storage
    if (globalThis[SSR_INJECT_ID]) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete globalThis[SSR_INJECT_ID];
    }
});

describe(cssStyleInject, () => {
    describe("basic functionality", () => {
        it("should inject CSS into head by default", () => {
            expect.assertions(3);

            const css = "body { margin: 0; }";

            cssStyleInject(css);

            expect(mockDocument.createElement).toHaveBeenCalledWith("style");
            // `type="text/css"` is no longer set (optional since HTML5).
            expect(mockElement.setAttribute).not.toHaveBeenCalledWith("type", "text/css");
            expect(mockElement.append).toHaveBeenCalledWith(expect.any(Object));
        });

        it("should not inject empty CSS", () => {
            expect.assertions(1);

            cssStyleInject("");

            expect(mockDocument.createElement).not.toHaveBeenCalled();
        });

        it("should not inject null/undefined CSS", () => {
            expect.assertions(1);

            // @ts-expect-error - test null/undefined
            cssStyleInject(null);
            // @ts-expect-error - test null/undefined
            cssStyleInject(undefined);

            expect(mockDocument.createElement).not.toHaveBeenCalled();
        });
    });

    describe("sSR functionality", () => {
        it("should store CSS in global when document is undefined", () => {
            expect.assertions(2);

            // Mock SSR environment
            Object.defineProperty(globalThis, "document", {
                value: undefined,
                writable: true,
            });

            const css = "body { margin: 0; }";
            const id = "test-style";

            cssStyleInject(css, { id });

            expect(globalThis[SSR_INJECT_ID]).toBeDefined();
            expect(globalThis[SSR_INJECT_ID]).toStrictEqual([{ css, id }]);
        });

        it("should not store a second SSR module with an already-seen id", () => {
            expect.assertions(1);

            Object.defineProperty(globalThis, "document", {
                value: undefined,
                writable: true,
            });

            const id = "dup-style";

            cssStyleInject("body { margin: 0; }", { id });
            cssStyleInject("h1 { color: red; }", { id });

            // Only the first injection is stored; the second (same id) is deduped.
            expect(globalThis[SSR_INJECT_ID]).toStrictEqual([{ css: "body { margin: 0; }", id }]);
        });

        it("should verify SSR_INJECT_ID constant", () => {
            expect.assertions(1);
            expect(SSR_INJECT_ID).toBe("__styleInject_SSR_MODULES");
        });
    });

    describe("iD and deduplication", () => {
        it("should add id attribute to style tag", () => {
            expect.assertions(1);

            const css = "body { margin: 0; }";
            const id = "test-style";

            cssStyleInject(css, { id });

            expect(mockElement.setAttribute).toHaveBeenCalledWith("id", id);
        });

        it("should skip injection if element with same id exists", () => {
            expect.assertions(2);

            const id = "test-style";

            mockDocument.getElementById.mockReturnValue(mockElement);

            cssStyleInject("body { margin: 0; }", { id });

            expect(mockDocument.getElementById).toHaveBeenCalledWith(id);
            expect(mockDocument.createElement).not.toHaveBeenCalled();
        });

        it("should inject if no element with id exists", () => {
            expect.assertions(2);

            const id = "test-style";

            mockDocument.getElementById.mockReturnValue(null);

            cssStyleInject("body { margin: 0; }", { id });

            expect(mockDocument.getElementById).toHaveBeenCalledWith(id);
            expect(mockDocument.createElement).toHaveBeenCalledWith("style");
        });
    });

    describe("insertAt functionality", () => {
        beforeEach(() => {
            // Mock container with some children
            mockElement.children = [
                { before: vi.fn() } as unknown as Element,
                { before: vi.fn() } as unknown as Element,
                { before: vi.fn() } as unknown as Element,
            ];
        });

        it("should insert at first position", () => {
            expect.assertions(1);

            cssStyleInject("body { margin: 0; }", { insertAt: "first" });

            expect(mockElement.prepend).toHaveBeenCalledWith(mockElement);
        });

        it("should insert at last position (default)", () => {
            expect.assertions(1);

            cssStyleInject("body { margin: 0; }");

            expect(mockElement.append).toHaveBeenCalledWith(mockElement);
        });

        it("should insert at last position explicitly", () => {
            expect.assertions(1);

            cssStyleInject("body { margin: 0; }", { insertAt: "last" });

            expect(mockElement.append).toHaveBeenCalledWith(mockElement);
        });

        it("should insert at specific index", () => {
            expect.assertions(1);

            cssStyleInject("body { margin: 0; }", { insertAt: 1 });

            expect((mockElement.children[1] as unknown as { before: Mock }).before).toHaveBeenCalledWith(mockElement);
        });

        it("should insert at beginning for index 0", () => {
            expect.assertions(1);

            cssStyleInject("body { margin: 0; }", { insertAt: 0 });

            expect(mockElement.prepend).toHaveBeenCalledWith(mockElement);
        });

        it("should insert at end for out-of-bounds positive index", () => {
            expect.assertions(1);

            cssStyleInject("body { margin: 0; }", { insertAt: 10 });

            expect(mockElement.append).toHaveBeenCalledWith(mockElement);
        });

        it("should append at the end for insertAt -1 (after last child)", () => {
            expect.assertions(1);

            // -1 resolves to children.length + (-1) + 1 = children.length -> append.
            cssStyleInject("body { margin: 0; }", { insertAt: -1 });

            expect(mockElement.append).toHaveBeenCalledWith(mockElement);
        });

        it("should insert before the last child for insertAt -2", () => {
            expect.assertions(1);

            // With 3 children, -2 resolves to 3 + (-2) + 1 = 2 -> before children[2].
            cssStyleInject("body { margin: 0; }", { insertAt: -2 });

            expect((mockElement.children[2] as unknown as { before: Mock }).before).toHaveBeenCalledWith(mockElement);
        });

        it("should insert before specific element", () => {
            expect.assertions(2);

            const targetElement = { before: vi.fn() };

            mockElement.querySelector.mockReturnValue(targetElement);

            cssStyleInject("body { margin: 0; }", { insertAt: { before: "title" } });

            expect(mockElement.querySelector).toHaveBeenCalledWith("title");
            expect(targetElement.before).toHaveBeenCalledWith(mockElement);
        });

        it("should fallback to append if target element not found", () => {
            expect.assertions(2);

            mockElement.querySelector.mockReturnValue(null);

            cssStyleInject("body { margin: 0; }", { insertAt: { before: "title" } });

            expect(mockElement.querySelector).toHaveBeenCalledWith("title");
            expect(mockElement.append).toHaveBeenCalledWith(mockElement);
        });

        it("should wrap an invalid insertAt.before selector error with context", () => {
            expect.assertions(1);

            mockElement.querySelector.mockImplementationOnce(() => {
                throw new SyntaxError("'!!!' is not a valid selector");
            });

            expect(() => {
                cssStyleInject("body { margin: 0; }", { insertAt: { before: "!!!" } });
            }).toThrow("Invalid selector for the `insertAt.before` option");
        });
    });

    describe("container selection", () => {
        it("should use custom container when provided", () => {
            expect.assertions(1);

            const customContainer = { ...mockElement };

            mockDocument.querySelector.mockReturnValue(customContainer);

            cssStyleInject("body { margin: 0; }", { container: ".custom-container" });

            expect(mockDocument.querySelector).toHaveBeenCalledWith(".custom-container");
        });

        it("should throw error if custom container not found", () => {
            expect.assertions(1);

            mockDocument.querySelector.mockReturnValue(null);

            expect(() => {
                cssStyleInject("body { margin: 0; }", { container: ".non-existent" });
            }).toThrow("Unable to find container element");
        });

        it("should use document.head as default container (fast path)", () => {
            expect.assertions(2);

            cssStyleInject("body { margin: 0; }");

            // The fast path uses document.head directly and must NOT fall back to
            // the querySelectorAll("head") lookup.
            expect(mockDocument.querySelectorAll).not.toHaveBeenCalledWith("head");
            expect(mockElement.append).toHaveBeenCalled();
        });

        it("should fall back to querySelectorAll('head') when document.head is absent", () => {
            expect.assertions(1);

            // @ts-expect-error - simulate an environment/test double without document.head
            mockDocument.head = undefined;
            mockDocument.querySelectorAll.mockReturnValue([mockElement]);

            cssStyleInject("body { margin: 0; }");

            expect(mockDocument.querySelectorAll).toHaveBeenCalledWith("head");
        });
    });

    describe("attributes and nonce", () => {
        it("should add custom attributes to style tag", () => {
            expect.assertions(2);

            const attributes = { class: "my-style", "data-test": "value" };

            cssStyleInject("body { margin: 0; }", { attributes });

            expect(mockElement.setAttribute).toHaveBeenCalledWith("data-test", "value");
            expect(mockElement.setAttribute).toHaveBeenCalledWith("class", "my-style");
        });

        it("should set nonce via the IDL property, not a readable attribute", () => {
            expect.assertions(2);

            const nonce = "abc123";

            cssStyleInject("body { margin: 0; }", { nonce });

            // Set via the property (CSP-checked, not reflected into a readable attribute).
            expect(mockElement.nonce).toBe(nonce);
            expect(mockElement.setAttribute).not.toHaveBeenCalledWith("nonce", nonce);
        });

        it("should add both custom attributes and nonce", () => {
            expect.assertions(2);

            const attributes = { "data-test": "value" };
            const nonce = "abc123";

            cssStyleInject("body { margin: 0; }", { attributes, nonce });

            expect(mockElement.setAttribute).toHaveBeenCalledWith("data-test", "value");
            expect(mockElement.nonce).toBe(nonce);
        });

        it("should drop reserved attribute keys (id/type/nonce)", () => {
            expect.assertions(3);

            cssStyleInject("body { margin: 0; }", {
                attributes: { id: "evil-id", nonce: "evil-nonce", type: "evil-type" },
            });

            expect(mockElement.setAttribute).not.toHaveBeenCalledWith("id", "evil-id");
            expect(mockElement.setAttribute).not.toHaveBeenCalledWith("type", "evil-type");
            expect(mockElement.setAttribute).not.toHaveBeenCalledWith("nonce", "evil-nonce");
        });

        it("should drop event-handler (on*) attributes", () => {
            expect.assertions(3);

            cssStyleInject("body { margin: 0; }", {
                attributes: { class: "ok", onclick: "alert(2)", onload: "alert(1)" },
            });

            expect(mockElement.setAttribute).not.toHaveBeenCalledWith("onload", "alert(1)");
            expect(mockElement.setAttribute).not.toHaveBeenCalledWith("onclick", "alert(2)");
            // Non-reserved attributes are still applied.
            expect(mockElement.setAttribute).toHaveBeenCalledWith("class", "ok");
        });
    });

    describe("cSS content injection", () => {
        it("should append text node for normal elements", () => {
            expect.assertions(2);

            const css = "body { margin: 0; }";
            const textNode = { nodeType: 3, textContent: css };

            mockDocument.createTextNode.mockReturnValue(textNode);

            cssStyleInject(css);

            expect(mockDocument.createTextNode).toHaveBeenCalledWith(css);
            expect(mockElement.append).toHaveBeenCalledWith(textNode);
        });
    });

    describe("single tag functionality", () => {
        it("should reuse same style tag for same configuration", () => {
            expect.assertions(1);

            // First injection
            cssStyleInject("body { margin: 0; }", { singleTag: true });
            const firstCreateCall = mockDocument.createElement.mock.calls.length;

            // Second injection with same config
            cssStyleInject("h1 { color: red; }", { singleTag: true });
            const secondCreateCall = mockDocument.createElement.mock.calls.length;

            // Should not create new element
            expect(secondCreateCall).toBe(firstCreateCall);
        });

        it("should create separate tags for different containers", () => {
            expect.assertions(1);

            const container1 = { ...mockElement };
            const container2 = { ...mockElement };

            mockDocument.querySelector.mockReturnValueOnce(container1).mockReturnValueOnce(container2);

            cssStyleInject("body { margin: 0; }", { container: ".container1", singleTag: true });
            cssStyleInject("h1 { color: red; }", { container: ".container2", singleTag: true });

            expect(mockDocument.createElement).toHaveBeenCalledTimes(2);
        });

        it("should create separate tags for different insertAt configs", () => {
            expect.assertions(1);

            // Reset mock between calls
            vi.clearAllMocks();

            cssStyleInject("body { margin: 0; }", { insertAt: "first", singleTag: true });
            const firstCallCount = mockDocument.createElement.mock.calls.length;

            cssStyleInject("h1 { color: red; }", { insertAt: 0, singleTag: true });
            const secondCallCount = mockDocument.createElement.mock.calls.length;

            expect(secondCallCount).toBe(firstCallCount + 1);
        });

        it("should create separate tags for different before selectors", () => {
            expect.assertions(1);

            cssStyleInject("body { margin: 0; }", { insertAt: { before: "title" }, singleTag: true });
            cssStyleInject("h1 { color: red; }", { insertAt: { before: "meta" }, singleTag: true });

            expect(mockDocument.createElement).toHaveBeenCalledTimes(2);
        });

        it("should re-apply the nonce on a reused single tag", () => {
            expect.assertions(2);

            // First call creates the tag and sets the nonce.
            cssStyleInject("body { margin: 0; }", { nonce: "first-nonce", singleTag: true });

            expect(mockElement.nonce).toBe("first-nonce");

            // Second call reuses the cached tag but the nonce is re-applied every call.
            cssStyleInject("h1 { color: red; }", { nonce: "second-nonce", singleTag: true });

            expect(mockElement.nonce).toBe("second-nonce");
        });
    });

    describe("edge cases and error handling", () => {
        it("should handle missing head element gracefully", () => {
            expect.assertions(1);

            // @ts-expect-error - simulate an environment without document.head
            mockDocument.head = undefined;
            mockDocument.querySelectorAll.mockReturnValue([]);

            expect(() => {
                cssStyleInject("body { margin: 0; }");
            }).toThrow("Unable to find container element");
        });

        it("should handle all options together", () => {
            expect.assertions(5);

            const options = {
                attributes: { "data-test": "value" },
                container: ".custom-container",
                id: "test-style",
                insertAt: 1 as const,
                nonce: "abc123",
                singleTag: true,
            };

            const customContainer = {
                ...mockElement,
                children: [{ before: vi.fn() }, { before: vi.fn() }],
            };

            // ID dedup uses getElementById (no existing element); querySelector is used
            // only for the custom container selection.
            mockDocument.getElementById.mockReturnValue(null);
            mockDocument.querySelector.mockReturnValue(customContainer);

            expect(() => {
                cssStyleInject("body { margin: 0; }", options);
            }).not.toThrow();

            expect(mockElement.setAttribute).toHaveBeenCalledWith("id", "test-style");
            expect(mockElement.setAttribute).toHaveBeenCalledWith("data-test", "value");
            expect(mockElement.nonce).toBe("abc123");
            expect((customContainer.children[1] as unknown as { before: Mock }).before).toHaveBeenCalledWith(mockElement);
        });

        it("should handle empty options object", () => {
            expect.assertions(1);

            // Ensure querySelectorAll returns a valid head element
            mockDocument.querySelectorAll.mockReturnValue([mockElement]);

            expect(() => {
                cssStyleInject("body { margin: 0; }", {});
            }).not.toThrow();
        });

        it("should handle no options parameter", () => {
            expect.assertions(1);

            // Ensure querySelectorAll returns a valid head element
            mockDocument.querySelectorAll.mockReturnValue([mockElement]);

            expect(() => {
                cssStyleInject("body { margin: 0; }");
            }).not.toThrow();
        });
    });
});
