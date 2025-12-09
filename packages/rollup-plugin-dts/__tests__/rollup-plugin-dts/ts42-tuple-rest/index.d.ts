interface Leading {}
interface Middle {}

export type UsesLeading = [...Leading[], number];
export type UsesMiddle = [boolean, ...Middle[], boolean];
