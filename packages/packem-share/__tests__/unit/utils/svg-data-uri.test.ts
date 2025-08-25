import { describe, expect, it } from "vitest";

import { svgToCssDataUri, svgToTinyDataUri } from "../../../src/utils/svg-data-uri";

describe("svgToTinyDataUri", () => {
    it("should convert simple SVG to tiny data URI", () => {
        expect.assertions(2);

        const svg = "<svg><path d='M0 0'/></svg>";
        const result = svgToTinyDataUri(svg);

        expect(result).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
        expect(result).toContain("M0 0");
    });

    it("should remove BOM characters", () => {
        expect.assertions(1);

        const svgWithBom = "\uFEFF<svg><path d='M0 0'/></svg>";
        const result = svgToTinyDataUri(svgWithBom);

        expect(result).not.toContain("\uFEFF");
    });

    it("should remove SVG comments", () => {
        expect.assertions(1);

        const svgWithComments = "<svg><!-- comment --><path d='M0 0'/></svg>";
        const result = svgToTinyDataUri(svgWithComments);

        expect(result).not.toContain("comment");
    });

    it("should collapse whitespace", () => {
        expect.assertions(1);

        const svgWithWhitespace = "<svg>\n\t<path\n\t\td='M0 0'\n\t/>\n</svg>";
        const result = svgToTinyDataUri(svgWithWhitespace);

        // Decode the data URI to check the content
        const decoded = decodeURIComponent(result.replace(/^data:image\/svg\+xml;charset=utf-8,/, ""));
        expect(decoded).toContain("<svg> <path d='M0 0' /> </svg>");
    });

    it("should replace double quotes with single quotes", () => {
        expect.assertions(2);

        const svgWithQuotes = '<svg viewBox="0 0 100 100"><path d="M0 0"/></svg>';
        const result = svgToTinyDataUri(svgWithQuotes);

        expect(result).toContain("viewBox='0 0 100 100'");
        expect(result).toContain("d='M0 0'");
    });

    it("should handle special hex encoding", () => {
        expect.assertions(1);

        const svgWithSpecialChars = '<svg><path d="M0 0 H10 V10"/></svg>';
        const result = svgToTinyDataUri(svgWithSpecialChars);

        // Should encode spaces and special characters properly
        expect(result).toContain("M0 0 H10 V10");
    });

    it("should handle complex SVG with all transformations", () => {
        expect.assertions(5);

        const complexSvg = `
            <!-- Complex SVG -->
            <svg
                class="icon"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
            >
                <path
                    d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"
                    fill="currentColor"
                />
            </svg>
        `;
        const result = svgToTinyDataUri(complexSvg);

        // Should remove comments, collapse whitespace, and replace quotes
        expect(result).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
        expect(result).not.toContain("<!--");
        expect(result).not.toContain("-->");
        expect(result).toContain("viewBox='0 0 24 24'");
        expect(result).toContain("d='M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z'");
    });

    it("should handle empty SVG", () => {
        expect.assertions(1);

        const result = svgToTinyDataUri("");

        expect(result).toBe("data:image/svg+xml;charset=utf-8,");
    });

    it("should handle SVG with only whitespace", () => {
        expect.assertions(1);

        const result = svgToTinyDataUri("   \n\t  ");

        expect(result).toBe("data:image/svg+xml;charset=utf-8,");
    });
});

describe("svgToCssDataUri", () => {
    it("should convert simple SVG to CSS data URI", () => {
        expect.assertions(2);

        const svg = "<svg><path d='M0 0'/></svg>";
        const result = svgToCssDataUri(svg);

        expect(result).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
        // Decode the data URI to check the content
        const decoded = decodeURIComponent(result.replace(/^data:image\/svg\+xml;charset=utf-8,/, ""));
        expect(decoded).toContain("M0 0");
    });

    it("should remove SVG comments", () => {
        expect.assertions(1);

        const svgWithComments = "<svg><!-- comment --><path d='M0 0'/></svg>";
        const result = svgToCssDataUri(svgWithComments);

        expect(result).not.toContain("comment");
    });

    it("should collapse whitespace to single spaces", () => {
        expect.assertions(1);

        const svgWithWhitespace = "<svg>\n\t<path\n\t\td='M0 0'\n\t/>\n</svg>";
        const result = svgToCssDataUri(svgWithWhitespace);

        // Decode the data URI to check the content
        const decoded = decodeURIComponent(result.replace(/^data:image\/svg\+xml;charset=utf-8,/, ""));
        expect(decoded).toContain("<svg> <path d='M0 0' /> </svg>");
    });

    it("should preserve double quotes", () => {
        expect.assertions(2);

        const svgWithQuotes = '<svg viewBox="0 0 100 100"><path d="M0 0"/></svg>';
        const result = svgToCssDataUri(svgWithQuotes);

        // Decode the data URI to check the content
        const decoded = decodeURIComponent(result.replace(/^data:image\/svg\+xml;charset=utf-8,/, ""));
        expect(decoded).toContain('viewBox="0 0 100 100"');
        expect(decoded).toContain('d="M0 0"');
    });

    it("should handle complex SVG with all transformations", () => {
        expect.assertions(5);

        const complexSvg = `
            <!-- Complex SVG -->
            <svg
                class="icon"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
            >
                <path
                    d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"
                    fill="currentColor"
                />
            </svg>
        `;
        const result = svgToCssDataUri(complexSvg);

        // Should remove comments and collapse whitespace, but preserve quotes
        expect(result).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
        expect(result).not.toContain("<!--");
        expect(result).not.toContain("-->");
        // Decode the data URI to check the content
        const decoded = decodeURIComponent(result.replace(/^data:image\/svg\+xml;charset=utf-8,/, ""));
        expect(decoded).toContain('viewBox="0 0 24 24"');
        expect(decoded).toContain('d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"');
    });

    it("should handle empty SVG", () => {
        expect.assertions(1);

        const result = svgToCssDataUri("");

        expect(result).toBe("data:image/svg+xml;charset=utf-8,");
    });

    it("should handle SVG with only whitespace", () => {
        expect.assertions(1);

        const result = svgToCssDataUri("   \n\t  ");

        expect(result).toBe("data:image/svg+xml;charset=utf-8,");
    });
});

describe("SVG data URI functions comparison", () => {
    it("should produce different results for the same SVG", () => {
        expect.assertions(1);

        const svg = '<svg viewBox="0 0 100 100"><path d="M0 0 H10 V10"/></svg>';
        const tinyResult = svgToTinyDataUri(svg);
        const cssResult = svgToCssDataUri(svg);

        // Tiny version should be more optimized (smaller)
        expect(tinyResult.length).toBeLessThan(cssResult.length);
    });

    it("should both include charset=utf-8", () => {
        expect.assertions(2);

        const svg = "<svg><path d='M0 0'/></svg>";
        const tinyResult = svgToTinyDataUri(svg);
        const cssResult = svgToCssDataUri(svg);

        expect(tinyResult).toContain(";charset=utf-8,");
        expect(cssResult).toContain(";charset=utf-8,");
    });

    it("should handle BOM differently", () => {
        expect.assertions(2);

        const svgWithBom = "\uFEFF<svg><path d='M0 0'/></svg>";
        const tinyResult = svgToTinyDataUri(svgWithBom);
        const cssResult = svgToCssDataUri(svgWithBom);

        // Both should remove BOM
        expect(tinyResult).not.toContain("\uFEFF");
        expect(cssResult).not.toContain("\uFEFF");
    });
});
