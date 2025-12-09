type MyNumber = number;

export type SomeNum = "100" extends `${infer U extends MyNumber}` ? U : never;
