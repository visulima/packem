// eslint-disable-next-line import/no-extraneous-dependencies
import { isolatedDeclaration } from "oxc-transform";

import type { IsolatedDeclarationsResult } from "../../../types";

const isolatedDeclarationsOxcPlugin = (id: string, code: string): IsolatedDeclarationsResult => isolatedDeclaration(id, code)

export default isolatedDeclarationsOxcPlugin;
