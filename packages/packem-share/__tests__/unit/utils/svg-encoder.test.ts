import { describe, expect, it } from "vitest";

import svgEncoder from "../../../src/utils/svg-encoder";

describe(svgEncoder, () => {
    it("should correctly encode a simple SVG string to Base64", () => {
        expect.assertions(1);

        const svgInput = "<svg><path d='M0 0 H10 V10 H0 Z'/></svg>";
        const expectedOutput = Buffer.from(svgInput).toString("base64");

        expect(svgEncoder(Buffer.from(svgInput, "utf8"))).toBe(expectedOutput);
    });

    it("should remove '//gs' comments", () => {
        expect.assertions(1);

        const svgInput = "<svg>//gs<path d='M0 0 H10 V10 H0 Z'/></svg>";
        const cleanedSvg = "<svg><path d='M0 0 H10 V10 H0 Z'/></svg>";
        const expectedOutput = Buffer.from(cleanedSvg).toString("base64");

        expect(svgEncoder(Buffer.from(svgInput, "utf8"))).toBe(expectedOutput);
    });

    it("should remove class attributes", () => {
        expect.assertions(1);

        const svgInput = '<svg class="my-class"><path class="another-class" d="M0 0 H10 V10 H0 Z"/></svg>';
        const cleanedSvg = '<svg><path d="M0 0 H10 V10 H0 Z"/></svg>';
        const expectedOutput = Buffer.from(cleanedSvg).toString("base64");

        expect(svgEncoder(Buffer.from(svgInput, "utf8"))).toBe(expectedOutput);
    });

    it("should remove class attributes with double quotes", () => {
        expect.assertions(1);

        const svgInput = '<svg class="my-class"><path class="another-class" d="M0 0 H10 V10 H0 Z"/></svg>';
        const cleanedSvg = '<svg><path d="M0 0 H10 V10 H0 Z"/></svg>';
        const expectedOutput = Buffer.from(cleanedSvg).toString("base64");

        expect(svgEncoder(Buffer.from(svgInput, "utf8"))).toBe(expectedOutput);
    });

    it("should normalize whitespace (newlines, tabs, multiple spaces)", () => {
        expect.assertions(1);

        const svgInput = "<svg>  <path\n\td='M0 0 H10 V10 H0 Z'/>\r\n</svg>";
        const cleanedSvg = "<svg> <path d='M0 0 H10 V10 H0 Z'/> </svg>";
        const expectedOutput = Buffer.from(cleanedSvg).toString("base64");

        expect(svgEncoder(Buffer.from(svgInput, "utf8"))).toBe(expectedOutput);
    });

    it("should trim leading and trailing whitespace", () => {
        expect.assertions(1);

        const svgInput = "  <svg><path d='M0 0 H10 V10 H0 Z'/></svg>  ";
        const cleanedSvg = "<svg><path d='M0 0 H10 V10 H0 Z'/></svg>";
        const expectedOutput = Buffer.from(cleanedSvg).toString("base64");

        expect(svgEncoder(Buffer.from(svgInput, "utf8"))).toBe(expectedOutput);
    });

    it("should handle a combination of all transformations", () => {
        expect.assertions(1);

        const svgInput = `
            //gs
            <svg class="test-svg"  version="1.1">
                <rect
                    class='bg-rect'
                    x="0"
                    y="0"
                    width="100"
                    height="100"
                />
                <path
                    class = "important-path"
                    d="M10 10 H 90 V 90 H 10 L 10 10"
                />
            </svg>
        `;
        const cleanedSvg = '<svg version="1.1"> <rect x="0" y="0" width="100" height="100" /> <path d="M10 10 H 90 V 90 H 10 L 10 10" /> </svg>';
        const expectedOutput = Buffer.from(cleanedSvg).toString("base64");

        expect(svgEncoder(Buffer.from(svgInput, "utf8"))).toBe(expectedOutput);
    });

    it("should handle empty input", () => {
        expect.assertions(1);

        const svgInput = "";
        const expectedOutput = Buffer.from("").toString("base64");

        expect(svgEncoder(Buffer.from(svgInput, "utf8"))).toBe(expectedOutput);
    });

    it("should handle SVG with comments and class attributes inside path data", () => {
        expect.assertions(1);

        // This test ensures that the regex for class removal is not too greedy
        // and doesn't mess with path data that might coincidentally look like a class attribute.
        const svgInput = String.raw`<svg><path d="M0 0 class=\'test\' //gs still here"></path></svg>`;
        const cleanedSvg = String.raw`<svg><path d="M0 0 class=\'test\' still here"></path></svg>`;
        const expectedOutput = Buffer.from(cleanedSvg).toString("base64");

        expect(svgEncoder(Buffer.from(svgInput, "utf8"))).toBe(expectedOutput);
    });

    it("should remove class attributes with single quotes", () => {
        expect.assertions(1);

        const svgInput = "<svg class='my-class'><path class='another-class' d='M0 0 H10 V10 H0 Z'/></svg>";
        const cleanedSvg = "<svg><path d='M0 0 H10 V10 H0 Z'/></svg>";
        const expectedOutput = Buffer.from(cleanedSvg).toString("base64");

        expect(svgEncoder(Buffer.from(svgInput, "utf8"))).toBe(expectedOutput);
    });

    it("should handle mixed quote types in class attributes", () => {
        expect.assertions(1);

        const svgInput = "<svg class=\"outer\"><g class='inner'><path class=\"path-class\" d='M0 0'/></g></svg>";
        const cleanedSvg = "<svg><g><path d='M0 0'/></g></svg>";
        const expectedOutput = Buffer.from(cleanedSvg).toString("base64");

        expect(svgEncoder(Buffer.from(svgInput, "utf8"))).toBe(expectedOutput);
    });

    it("should handle class attributes with special characters", () => {
        expect.assertions(1);

        const svgInput = '<svg class="my-class_123 another-class.dot"><path class="special@chars!" d=\'M0 0\'/></svg>';
        const cleanedSvg = "<svg><path d='M0 0'/></svg>";
        const expectedOutput = Buffer.from(cleanedSvg).toString("base64");

        expect(svgEncoder(Buffer.from(svgInput, "utf8"))).toBe(expectedOutput);
    });

    it("should handle class attributes with nested quotes (escaped)", () => {
        expect.assertions(1);

        // This test handles properly escaped quotes in HTML attributes - quite rare but valid
        const svgInput = String.raw`<svg class="my&quot;class&quot;"><path class='my&apos;class&apos;' d='M0 0'/></svg>`;
        const cleanedSvg = "<svg><path d='M0 0'/></svg>";
        const expectedOutput = Buffer.from(cleanedSvg).toString("base64");

        expect(svgEncoder(Buffer.from(svgInput, "utf8"))).toBe(expectedOutput);
    });

    it("should handle class attributes with whitespace variations", () => {
        expect.assertions(1);

        const svgInput = "<svg   class  =  \"my-class\"  ><path  class=   'another-class'   d='M0 0'/></svg>";
        const cleanedSvg = "<svg ><path d='M0 0'/></svg>";
        const expectedOutput = Buffer.from(cleanedSvg).toString("base64");

        expect(svgEncoder(Buffer.from(svgInput, "utf8"))).toBe(expectedOutput);
    });

    it("should handle empty class attributes", () => {
        expect.assertions(1);

        const svgInput = "<svg class=\"\"><path class='' d='M0 0'/></svg>";
        const cleanedSvg = "<svg><path d='M0 0'/></svg>";
        const expectedOutput = Buffer.from(cleanedSvg).toString("base64");

        expect(svgEncoder(Buffer.from(svgInput, "utf8"))).toBe(expectedOutput);
    });

    it("should not remove non-class attributes that contain 'class' in their name", () => {
        expect.assertions(1);

        const svgInput = "<svg superclass=\"test\" subclass='value' someclass=\"data\"><path d='M0 0'/></svg>";
        const cleanedSvg = "<svg superclass=\"test\" subclass='value' someclass=\"data\"><path d='M0 0'/></svg>";
        const expectedOutput = Buffer.from(cleanedSvg).toString("base64");

        expect(svgEncoder(Buffer.from(svgInput, "utf8"))).toBe(expectedOutput);
    });

    it("should handle multiple class attributes on the same element", () => {
        expect.assertions(1);

        // Note: This is invalid HTML but we should handle it gracefully
        const svgInput = "<svg class=\"first\" class='second'><path d='M0 0'/></svg>";
        const cleanedSvg = "<svg><path d='M0 0'/></svg>";
        const expectedOutput = Buffer.from(cleanedSvg).toString("base64");

        expect(svgEncoder(Buffer.from(svgInput, "utf8"))).toBe(expectedOutput);
    });

    it("should not affect class-like patterns in other attribute values", () => {
        expect.assertions(1);

        // Only actual class attributes should be removed, not class-like strings in other attributes
        const svgInput = '<svg data-content="not-a-class-attr"><path data-info="also-not-class" d=\'M0 0\'/></svg>';
        const cleanedSvg = '<svg data-content="not-a-class-attr"><path data-info="also-not-class" d=\'M0 0\'/></svg>';
        const expectedOutput = Buffer.from(cleanedSvg).toString("base64");

        expect(svgEncoder(Buffer.from(svgInput, "utf8"))).toBe(expectedOutput);
    });

    it("should handle class attributes with newlines and tabs in the attribute itself", () => {
        expect.assertions(1);

        // The whitespace around the attribute declaration should be handled
        const svgInput = "<svg\n\tclass=\"valid-class\"><path\tclass='also-valid' d='M0 0'/></svg>";

        // eslint-disable-next-line no-secrets/no-secrets
        expect(svgEncoder(Buffer.from(svgInput, "utf8"))).toBe("PHN2Zz48cGF0aCBkPSdNMCAwJy8+PC9zdmc+");
    });
});
