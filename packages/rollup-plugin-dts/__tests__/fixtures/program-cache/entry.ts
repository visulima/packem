export interface Shown {
    readonly kind: "shown";
}

/** @internal */
export const hidden = 1;

export const shown: Shown = { kind: "shown" };
