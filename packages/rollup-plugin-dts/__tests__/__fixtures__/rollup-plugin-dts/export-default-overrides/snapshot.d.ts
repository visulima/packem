// index.d.ts
// #region tests/rollup-plugin-dts/export-default-overrides/index.d.ts
declare function autobind(): ClassDecorator | MethodDecorator;
declare function autobind(constructor: Function): void;
declare function autobind(prototype: object, name: string, descriptor: PropertyDescriptor): PropertyDescriptor;
// #endregion
export default autobind;
