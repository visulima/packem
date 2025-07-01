import { makeLegalIdentifier } from "@rollup/pluginutils";
import { getHash } from "@visulima/packem-share/utils";

/**
 * Generates a safe, unique JavaScript identifier from an input string.
 *
 * Creates a legal JavaScript identifier by:
 * 1. Combining the input ID with a salt and additional salt parameters
 * 2. Generating a hash of the combined string
 * 3. Appending the hash to the ID to ensure uniqueness
 * 4. Making the result a legal JavaScript identifier
 *
 * This is useful for generating variable names that won't conflict with
 * reserved words or other identifiers in the generated code.
 * @param id Base identifier string
 * @param salt Additional salt values for uniqueness
 * @returns Legal JavaScript identifier with hash suffix
 * @example
 * ```typescript
 * safeId('myVar') // "myVar_a1b2c3d4"
 * safeId('class', 'module') // "class_e5f6g7h8"
 * safeId('my-component', 'css') // "my_component_i9j0k1l2"
 * ```
 */
const safeId = (id: string, ...salt: string[]): string => {
    const hash = getHash([id, "0iOXBLSx", ...salt].join(":")).slice(0, 8);

    return makeLegalIdentifier(`${id}_${hash}`);
};

export default safeId;
