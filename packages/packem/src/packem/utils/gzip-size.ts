import { createReadStream } from "node:fs";
import { createGzip } from "node:zlib";

const gzipSize = async (path: string): Promise<number> =>
    await new Promise((resolve, reject) => {
        let size = 0;
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        const pipe = createReadStream(path).pipe(createGzip({ level: 9 }));

        pipe.on("error", reject);
        pipe.on("data", (buf) => {
            size += buf.length;
        });
        pipe.on("end", () => {
            resolve(size);
        });
    });

export default gzipSize;
