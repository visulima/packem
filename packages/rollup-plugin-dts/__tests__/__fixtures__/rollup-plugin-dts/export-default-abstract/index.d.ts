import type MemberTypes from "./memberTypes";
import type TypeInfo from "./typeInfo";

export default abstract class MemberInfo {
    abstract readonly name: string;

    abstract readonly declaringType: TypeInfo;

    abstract readonly memberType: MemberTypes;
}
