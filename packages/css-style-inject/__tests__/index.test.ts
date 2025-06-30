import { beforeEach, describe, expect, it, vi } from "vitest";

import { cssStyleInject, SSR_INJECT_ID } from "../src/index";

// Mock DOM methods
const mockElement = {
    append: vi.fn(),
    before: vi.fn(),
    children: [] as Element[],
    insertAdjacentElement: vi.fn(),
    prepend: vi.fn(),
    querySelector: vi.fn(),
    querySelectorAll: vi.fn(),
    setAttribute: vi.fn(),
    styleSheet: undefined as any,
};

const mockDocument = {
    createElement: vi.fn(() => mockElement),
    createTextNode: vi.fn(() => { return { nodeType: 3, textContent: "" }; }),
    getElementById: vi.fn(),
    querySelector: vi.fn(),
    querySelectorAll: vi.fn(() => [mockElement]),
};

beforeEach(() => {
    vi.clearAllMocks();
    mockElement.children = [];
    mockElement.styleSheet = undefined;

    // Reset global document
    Object.defineProperty(globalThis, "document", {
        value: mockDocument,
        writable: true,
    });

    // Reset global SSR storage
    if (globalThis[SSR_INJECT_ID]) {
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
            expect(mockElement.setAttribute).toHaveBeenCalledWith("type", "text/css");
            expect(mockElement.append).toHaveBeenCalledWith(expect.any(Object));
        });

        it("should not inject empty CSS", () => {
            expect.assertions(1);

            cssStyleInject("");

            expect(mockDocument.createElement).not.toHaveBeenCalled();
        });

        it("should not inject null/undefined CSS", () => {
            expect.assertions(1);

            cssStyleInject(null as any);
            cssStyleInject(undefined as any);

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

            mockDocument.querySelector.mockReturnValue(mockElement);

            cssStyleInject("body { margin: 0; }", { id });

            expect(mockDocument.querySelector).toHaveBeenCalledWith(`#${id}`);
            expect(mockDocument.createElement).not.toHaveBeenCalled();
        });

        it("should inject if no element with id exists", () => {
            expect.assertions(2);

            const id = "test-style";

            mockDocument.querySelector.mockReturnValue(null);

            cssStyleInject("body { margin: 0; }", { id });

            expect(mockDocument.querySelector).toHaveBeenCalledWith(`#${id}`);
            expect(mockDocument.createElement).toHaveBeenCalledWith("style");
        });
    });

    describe("insertAt functionality", () => {
        beforeEach(() => {
            // Mock container with some children
            mockElement.children = [
                { before: vi.fn() } as any,
                { before: vi.fn() } as any,
                { before: vi.fn() } as any,
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

            expect((mockElement.children[1] as any).before).toHaveBeenCalledWith(mockElement);
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

        it("should handle negative indices", () => {
            expect.assertions(1);

            cssStyleInject("body { margin: 0; }", { insertAt: -1 });

            expect(mockElement.append).toHaveBeenCalledWith(mockElement);
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

        it("should use head as default container", () => {
            expect.assertions(1);

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

        it("should add nonce attribute", () => {
            expect.assertions(1);

            const nonce = "abc123";

            cssStyleInject("body { margin: 0; }", { nonce });

            expect(mockElement.setAttribute).toHaveBeenCalledWith("nonce", nonce);
        });

        it("should add both custom attributes and nonce", () => {
            expect.assertions(2);

            const attributes = { "data-test": "value" };
            const nonce = "abc123";

            cssStyleInject("body { margin: 0; }", { attributes, nonce });

            expect(mockElement.setAttribute).toHaveBeenCalledWith("data-test", "value");
            expect(mockElement.setAttribute).toHaveBeenCalledWith("nonce", nonce);
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

        it("should use styleSheet.cssText for IE compatibility", () => {
            expect.assertions(1);

            const css = "body { margin: 0; }";

            mockElement.styleSheet = { cssText: "" };

            cssStyleInject(css);

            expect(mockElement.styleSheet.cssText).toBe(css);
        });

        it("should append to existing styleSheet.cssText", () => {
            expect.assertions(1);

            const existingCss = "h1 { color: red; }";
            const newCss = "body { margin: 0; }";

            mockElement.styleSheet = { cssText: existingCss };

            cssStyleInject(newCss);

            expect(mockElement.styleSheet.cssText).toBe(existingCss + newCss);
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

            mockDocument.querySelector
                .mockReturnValueOnce(container1)
                .mockReturnValueOnce(container2);

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
    });

    describe("edge cases and error handling", () => {
        it("should handle missing head element gracefully", () => {
            expect.assertions(1);

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
                children: [
                    { before: vi.fn() } as any,
                    { before: vi.fn() } as any,
                ],
            };

            // Mock querySelector for container selection and ID check
            mockDocument.querySelector
                .mockReturnValueOnce(null) // First call for ID check returns null
                .mockReturnValueOnce(customContainer); // Second call for container selection

            expect(() => {
                cssStyleInject("body { margin: 0; }", options);
            }).not.toThrow();

            expect(mockElement.setAttribute).toHaveBeenCalledWith("id", "test-style");
            expect(mockElement.setAttribute).toHaveBeenCalledWith("data-test", "value");
            expect(mockElement.setAttribute).toHaveBeenCalledWith("nonce", "abc123");
            expect(customContainer.children[1].before).toHaveBeenCalledWith(mockElement);
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
