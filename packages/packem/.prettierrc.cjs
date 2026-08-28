const config = require("@anolilab/prettier-config");

module.exports = {
    ...config,

    // The codebase puts binary operators at the start of a wrapped line. Prettier's
    // default is "end", which would reflow every multi-line condition in the repo.
    experimentalOperatorPosition: "start",
};
