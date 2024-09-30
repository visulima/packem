import { getMap, stripMap } from "../utils/sourcemap";
import type { Loader } from "./types";

const loader: Loader = {
    alwaysProcess: true,
    name: "sourcemap",
    async process({ code, map }) {
        // eslint-disable-next-line no-param-reassign
        map = (await getMap(code, this.id)) ?? map;

        return { code: stripMap(code), map };
    },
};

export default loader;
