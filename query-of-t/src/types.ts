

export abstract class Type {

}

export class ArrayType extends Type {
    constructor(public readonly elementType: Type) {
        super()
    }
}

export class FunctionType extends Type {
    constructor(
        public readonly func: Function | undefined,
        public readonly returnType: Type) {
        super()
    }
}

export class LiteralType extends Type {

    static readonly boolean: LiteralType = new LiteralType("boolean");
    static readonly number: LiteralType = new LiteralType("number");
    static readonly string: LiteralType = new LiteralType("string");
    static readonly null: LiteralType = new LiteralType("null");

    constructor(public readonly typeName: "boolean" | "number" | "string" | "null") {
        super()
    }
}

export class NewType extends Type {
    constructor(public readonly constructorFunction: Function) {
        super()
    }
}

export class ObjectType extends Type {
    constructor(public readonly bindings: { [name: string]: Type | undefined }) {
        super()
    }
}