const test = () => {
    return "this should be in final bundle, test function";
};

/**
 * @type {string}
 */
const test2 = "this should be in final bundle, test2 string";

export { test2, test as default };
