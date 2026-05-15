import MagicString from "magic-string";
import type { Plugin } from "rollup";

import { RE_DTS } from "./filename";
import type { OptionsResolved } from "./options";

const createBannerPlugin = ({ banner, footer }: Pick<OptionsResolved, "banner" | "footer">): Plugin => {
    return {
        name: "rollup-plugin-dts:banner",
        async renderChunk(code: string, chunk) {
            if (!RE_DTS.test(chunk.fileName)) {
                return undefined;
            }

            const s = new MagicString(code);

            if (banner) {
                const bannerCode = await (typeof banner === "function" ? banner(chunk) : banner);

                if (bannerCode) {
                    s.prepend(`${bannerCode}\n`);
                }
            }

            if (footer) {
                const footerCode = await (typeof footer === "function" ? footer(chunk) : footer);

                if (footerCode) {
                    s.append(`\n${footerCode}`);
                }
            }

            return {
                code: s.toString(),
                get map() {
                    return s.generateMap({
                        hires: "boundary",
                        includeContent: true,
                        source: chunk.fileName,
                    });
                },
            };
        },
    };
};

export default createBannerPlugin;
