import { satisfies, validRange } from "semver";

import type { BuildContext, ValidationOptions } from "../../types";
import warn from "../../utils/warn";

/**
 * Default Node.js version range that provides a sensible baseline
 * This covers LTS versions that are actively maintained
 */
const DEFAULT_NODE_VERSION = ">=18.0.0";

const validateEngines = (context: BuildContext): void => {
    const validation = context.options.validation as ValidationOptions;
    const { pkg } = context;

    // Skip validation if engines validation is disabled
    if (validation.packageJson?.engines === false) {
        return;
    }

    const currentNodeVersion = process.version;
    const nodeVersionRange = pkg.engines?.node;

    // Check if engines.node field is missing
    if (!nodeVersionRange) {
        warn(
            context,
            `The 'engines.node' field is missing in your package.json. Consider adding "engines": { "node": "${DEFAULT_NODE_VERSION}" } to specify Node.js version requirements.`,
        );

        return;
    }

    // Check if the semver range is valid
    if (!validRange(nodeVersionRange)) {
        warn(
            context,
            `Invalid Node.js version range "${nodeVersionRange}" in engines.node field. Please use a valid semver range like "${DEFAULT_NODE_VERSION}".`,
        );

        return;
    }

    // Check if current Node.js version satisfies the requirement
    if (!satisfies(currentNodeVersion, nodeVersionRange)) {
        // This is a hard error that should fail the build
        throw new Error(
            `Node.js version mismatch: Current version ${currentNodeVersion} does not satisfy the required range "${nodeVersionRange}" specified in package.json engines.node field.`,
        );
    }
};

export default validateEngines;
