
import { Expression } from "./expressions";
import { LiteralType, Type } from "../entities/types";


class Alias {

}

abstract class DbExpression extends Expression {
    constructor(kind: string, type: Type) {
        super(kind, type)
    }
}

abstract class SourceExpression extends DbExpression {
    abstract knownAliases(): Alias[];

    constructor(kind: string) {
        super(kind, LiteralType.null);
    }
}

abstract class SourceWithAliasExpression extends SourceExpression {
    constructor(kind: string,
        public readonly alias: Alias) {
        super(kind)
    }
}
