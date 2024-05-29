import jiti from "jiti";

const tryRequire = <T>(id: string, rootDirectory: string): T => jiti(rootDirectory, { esmResolve: true, interopDefault: true })(id) as T;

export default tryRequire;
