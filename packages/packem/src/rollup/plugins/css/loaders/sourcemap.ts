import { getMap, stripMap } from "../utils/sourcemap";
import type { Loader } from "./types";

const loader: Loader = {
    alwaysProcess: true,
    name: "sourcemap",
    async process({ code, map }) {
        return { code: stripMap(code), map: await getMap(code, this.id) ?? map };
    },
};

export default loader;
