import { createReadStream } from "node:fs";
import { createGzip } from "node:zlib";

const gzipSize = async (path: string): Promise<number> =>
    await new Promise((resolve, reject) => {
        let size = 0;

        const readStream = createReadStream(path);
        const pipe = readStream.pipe(createGzip({ level: 9 }));

        readStream.on("error", reject);
        pipe.on("error", reject);
        pipe.on("data", (buffer: Buffer) => {
            size += buffer.length;
        });
        pipe.on("end", () => {
            resolve(size);
        });
    });

export default gzipSize;
