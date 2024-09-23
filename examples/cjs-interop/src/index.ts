const test = () => {
    return "this should be in final bundle, test function";
};

const test2 = "this should be in final bundle, test2 string";

export const test3 = {
    test4: "this should be in final bundle, test3 object",
    test5: () => {
        return "this should be in final bundle, test5 function";
    },
}

export { test2, test as default };
