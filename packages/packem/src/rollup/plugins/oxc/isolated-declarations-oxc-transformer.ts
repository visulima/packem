import { isolatedDeclaration } from "oxc-transform";

import type { IsolatedDeclarationsResult } from "../../../types";

const isolatedDeclarationsOxcTransformer = (id: string, code: string): IsolatedDeclarationsResult => isolatedDeclaration(id, code);

// eslint-disable-next-line import/no-unused-modules
export default isolatedDeclarationsOxcTransformer;
