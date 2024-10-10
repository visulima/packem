import { pail } from "@visulima/pail";
import { describe, expect, it, vi } from "vitest";

import LoaderManager from "../../../../../../src/rollup/plugins/css/loaders/loader";

vi.mock("@visulima/pail", () => {
    return {
        pail: {
            log: vi.fn(),
            warn: vi.fn(),
        }
    }
})

describe("loader", () => {
    it("should return the same input, when no loader was found", async () => {
        expect.assertions(1);

        const loaders = new LoaderManager({
            extensions: [],
            loaders: [],
            logger: pail,
            options: {
                emit: false,
                extensions: [],
                extract: "",
                inject: false,
            },
        });

        await expect(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            loaders.process({ code: "" }, { id: "file.less" } as any),
        ).resolves.toStrictEqual({ code: "" });
    });
});
