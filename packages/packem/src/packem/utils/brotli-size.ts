import { createReadStream } from "node:fs";
import { constants, createBrotliCompress } from "node:zlib";

// Quality 4 trades ~5% larger reported size for ~10x faster compression vs
// quality 11. The output is build-time reporting only — actual CDN delivery
// re-compresses at the operator's chosen level — so the slow max-quality
// estimate isn't load-bearing.
const brotliSize = async (path: string): Promise<number> =>
    await new Promise((resolve, reject) => {
        let size = 0;

        const readStream = createReadStream(path);
        const pipe = readStream.pipe(
            createBrotliCompress({
                params: {
                    [constants.BROTLI_PARAM_QUALITY]: 4,
                },
            }),
        );

        readStream.on("error", reject);
        pipe.on("error", reject);
        pipe.on("data", (buffer: Buffer) => {
            size += buffer.length;
        });
        pipe.on("end", () => {
            resolve(size);
        });
    });

export default brotliSize;
