import workerpool from "workerpool";

import type { TransformCodeOptions, TransformCodeResult } from "./transform-code";
import { transformCode } from "./transform-code";

/**
 * Worker entry point for parallel Babel transforms.
 *
 * Spawned by {@link workerpool} (one thread per pool slot) from the babel plugin
 * when a build is large enough to benefit from parallelism. Each `transform` call
 * receives a fully serializable payload (the file's source, its id, and the babel
 * transform options) and runs the exact same {@link transformCode} routine used on
 * the main thread, so the output is identical regardless of which path produced it.
 */
const transform = async (sourcecode: string, id: string, transformOptions: TransformCodeOptions): Promise<TransformCodeResult | undefined> =>
    transformCode(sourcecode, id, transformOptions);

workerpool.worker({
    transform,
});
