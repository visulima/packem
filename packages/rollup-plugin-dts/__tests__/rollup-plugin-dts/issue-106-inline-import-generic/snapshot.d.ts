// index.d.ts
// #region tests/rollup-plugin-dts/issue-106-inline-import-generic/options.d.ts
interface SimpleInterface {}
type ObjectWithParameter<ParameterObject> = { [Prop in keyof ParameterObject]?: any };
// #endregion
// #region tests/rollup-plugin-dts/issue-106-inline-import-generic/index.d.ts
declare class CalendarDataManager {
    emitter: ObjectWithParameter<SimpleInterface>;
}
// #endregion
export { CalendarDataManager };
