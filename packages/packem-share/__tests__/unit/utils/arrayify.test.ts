import { describe, expect, it } from "vitest";

import arrayify from "../../../src/utils/arrayify";

describe(arrayify, () => {
    it("should convert a single value to an array containing that value", () => {
        expect.assertions(1);

        const result = arrayify(5);

        expect(result).toStrictEqual([5]);
    });

    it("should return the same array if the input is already an array", () => {
        expect.assertions(1);

        const input = [1, 2, 3];
        const result = arrayify(input);

        expect(result).toBe(input);
    });

    it("should return an empty array if the input is null", () => {
        expect.assertions(1);

        // eslint-disable-next-line unicorn/no-null
        const result = arrayify(null);

        expect(result).toStrictEqual([]);
    });

    it("should return an empty array if the input is undefined", () => {
        expect.assertions(1);

        const result = arrayify(undefined);

        expect(result).toStrictEqual([]);
    });

    it("should handle input that is an empty array", () => {
        expect.assertions(1);

        const result = arrayify([]);

        expect(result).toStrictEqual([]);
    });

    it("should handle input that is an array of arrays", () => {
        expect.assertions(1);

        const input = [
            [1, 2],
            [3, 4],
        ];
        const result = arrayify(input);

        expect(result).toBe(input);
    });

    it("should handle input that is a boolean value", () => {
        expect.assertions(1);

        const result = arrayify(true);

        expect(result).toStrictEqual([true]);
    });

    it("should handle input that is a number", () => {
        expect.assertions(1);

        const result = arrayify(42);

        expect(result).toStrictEqual([42]);
    });

    it("should handle input that is an object", () => {
        expect.assertions(1);

        const object = { key: "value" };
        const result = arrayify(object);

        expect(result).toStrictEqual([object]);
    });

    it("should handle input that is a function", () => {
        expect.assertions(1);

        // eslint-disable-next-line no-underscore-dangle, @typescript-eslint/naming-convention
        const function_ = () => {};
        const result = arrayify(function_);

        expect(result).toStrictEqual([function_]);
    });

    it("should handle input that is a string", () => {
        expect.assertions(1);

        const result = arrayify("hello");

        expect(result).toStrictEqual(["hello"]);
    });

    it("should handle input that is a symbol", () => {
        expect.assertions(1);

        const sym = Symbol("sym");
        const result = arrayify(sym);

        expect(result).toStrictEqual([sym]);
    });
});
