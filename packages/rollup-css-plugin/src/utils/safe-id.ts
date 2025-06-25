import { makeLegalIdentifier } from "@rollup/pluginutils";
import { getHash } from "@visulima/packem-share/utils";

export default (id: string, ...salt: string[]): string => {
    const hash = getHash([id, "0iOXBLSx", ...salt].join(":")).slice(0, 8);

    return makeLegalIdentifier(`${id}_${hash}`);
};
