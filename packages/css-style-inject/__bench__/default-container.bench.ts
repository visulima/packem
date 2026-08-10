import { bench, describe } from "vitest";

import { cssStyleInject } from "../src";

// Benchmarks the default-container hot path of cssStyleInject.
//
// The optimization replaces `document.querySelectorAll("head")[0]` (selector
// parse + NodeList allocation on every call) with the cached `document.head`
// property reference. This bench exercises the real module on the default
// container path and includes a "before" baseline that resolves the container
// the old way so the win is directly comparable in the same describe block.
//
// Needs a DOM. happy-dom rather than jsdom: it is already the workspace's
// catalogued DOM environment, so this adds no new dependency tree for a bench
// that only touches `document.head`.
// @vitest-environment happy-dom

const CSS = ".bench-a{color:red}";

describe("default container resolution", () => {
    bench("after: cssStyleInject default head path (document.head)", () => {
        cssStyleInject(CSS);
    });

    bench("baseline: querySelectorAll('head')[0] container lookup", () => {
        // Mirror the pre-optimization container resolution to measure the cost
        // that the optimization removes from the hot path.
        const container = document.querySelectorAll("head")[0] as HTMLElement;
        const styleTag = document.createElement("style");

        styleTag.setAttribute("type", "text/css");
        styleTag.append(document.createTextNode(CSS));
        container.append(styleTag);
    });

    bench("optimized: document.head container lookup", () => {
        const container = document.head;
        const styleTag = document.createElement("style");

        styleTag.setAttribute("type", "text/css");
        styleTag.append(document.createTextNode(CSS));
        container.append(styleTag);
    });
});
