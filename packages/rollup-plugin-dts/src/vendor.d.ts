declare module "@babel/helper-validator-identifier" {
    // eslint-disable-next-line import/prefer-default-export -- Module augmentation requires named export to match the package's API
    export function isIdentifierName(name: string): boolean;
}
