import { describe, expect, it } from "vitest";

import svgEncoder from "../../../../src/rollup/utils/svg-encoder";

describe("svgEncoder", () => {
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

        const svgInput = "<svg>  <path\n\td=\'M0 0 H10 V10 H0 Z\'/>\r\n</svg>";
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
        const svgInput = "<svg><path d=\"M0 0 class=\\'test\\' //gs still here\"></path></svg>";
        const cleanedSvg = "<svg><path d=\"M0 0 class=\\'test\\' still here\"></path></svg>";
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
});
