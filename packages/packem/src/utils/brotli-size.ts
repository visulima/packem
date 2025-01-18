import { createReadStream } from "node:fs";
import { constants, createBrotliCompress } from "node:zlib";

const brotliSize = async (path: string): Promise<number> =>
    await new Promise((resolve, reject) => {
        let size = 0;

        const pipe = createReadStream(path).pipe(
            createBrotliCompress({
                params: {
                    [constants.BROTLI_PARAM_QUALITY]: 11,
                },
            }),
        );
        pipe.on("error", reject);
        pipe.on("data", (buf) => {
            // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
            size += buf.length;
        });
        pipe.on("end", () => {
            resolve(size);
        });
    });

export default brotliSize;
