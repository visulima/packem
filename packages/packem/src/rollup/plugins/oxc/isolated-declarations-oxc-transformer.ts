 
import { isolatedDeclaration } from "oxc-transform";

import type { IsolatedDeclarationsResult } from "../../../types";

const isolatedDeclarationsOxcTransformer = (id: string, code: string): IsolatedDeclarationsResult => isolatedDeclaration(id, code);

export default isolatedDeclarationsOxcTransformer;
