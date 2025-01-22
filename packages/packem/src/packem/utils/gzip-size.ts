import { createReadStream } from "node:fs";
import { createGzip } from "node:zlib";

const gzipSize = async (path: string): Promise<number> =>
    await new Promise((resolve, reject) => {
        let size = 0;
        const pipe = createReadStream(path).pipe(createGzip({ level: 9 }));
        pipe.on("error", reject);
        pipe.on("data", (buf) => {
            // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
            size += buf.length;
        });
        pipe.on("end", () => {
            resolve(size);
        });
    });

export default gzipSize;
