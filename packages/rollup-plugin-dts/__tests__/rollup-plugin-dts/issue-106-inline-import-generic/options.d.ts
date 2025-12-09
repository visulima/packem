export interface SimpleInterface {}

export type ObjectWithParam<ParameterObject> = {
    [Prop in keyof ParameterObject]?: any;
};
