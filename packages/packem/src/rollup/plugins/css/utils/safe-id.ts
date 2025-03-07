import { makeLegalIdentifier } from "@rollup/pluginutils";

import getHash from "../../../utils/get-hash";

export default (id: string, ...salt: string[]): string => {
    const hash = getHash([id, "0iOXBLSx", ...salt].join(":")).slice(0, 8);

    return makeLegalIdentifier(`${id}_${hash}`);
};
