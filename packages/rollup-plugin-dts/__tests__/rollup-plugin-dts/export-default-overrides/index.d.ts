export default function autobind(): ClassDecorator | MethodDecorator;
export default function autobind(constructor: Function): void;
export default function autobind(prototype: object, name: string, descriptor: PropertyDescriptor): PropertyDescriptor;
