import { describe, expect, it } from "vitest";

import replaceContentWithinMarker from "../../../src/utils/replace-content-within-marker";

describe(replaceContentWithinMarker, () => {
    it("should replace content between the markers", () => {
        expect.assertions(1);

        const content = "before\n<!-- start -->\nold\n<!-- /start -->\nafter";
        const result = replaceContentWithinMarker(content, "start", "new");

        expect(result).toBe("before\n<!-- start -->\nnew\n<!-- /start -->\nafter");
    });

    it("should return undefined when the marker is not present", () => {
        expect.assertions(1);

        expect(replaceContentWithinMarker("no markers here", "start", "new")).toBeUndefined();
    });

    it("should treat regex metacharacters in the marker literally", () => {
        expect.assertions(2);

        // A marker containing `(` would previously break or shift the RegExp.
        const marker = "section(1)";
        const content = `<!-- ${marker} -->\nold\n<!-- /${marker} -->`;
        const result = replaceContentWithinMarker(content, marker, "fresh");

        expect(result).toBe(`<!-- ${marker} -->\nfresh\n<!-- /${marker} -->`);
        // A different literal marker must not match this content.
        expect(replaceContentWithinMarker(content, "section.1.", "fresh")).toBeUndefined();
    });

    it("should treat $ replacement patterns in the replacement literally", () => {
        expect.assertions(1);

        // `$'`, `$&`, `$1`, `$$` must be inserted verbatim, not interpreted as
        // String.replace substitution patterns (e.g. license bodies).
        const replacement = "Copyright $' and $& and $1 and $$ literal";
        const content = "<!-- license -->\nplaceholder\n<!-- /license -->";
        const result = replaceContentWithinMarker(content, "license", replacement);

        expect(result).toBe(`<!-- license -->\n${replacement}\n<!-- /license -->`);
    });
});
