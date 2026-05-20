import { Expression } from "./expresions";
import { LiteralType, Type } from "./types";

class Table {

}

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

class ColumnExpression extends DbExpression {
    readonly alias: Alias;
    readonly name: string | null;

    constructor(type: Type, alias: Alias, name: string | null) {
        super("Column", type);

        this.alias = alias ?? new Alias(); // Assuming Alias has a default constructor
        this.name = name ?? (Schema.current.settings.isPostgres ? null : new Error("name cannot be null"));
    }

    toString(): string {
        return `${this.alias}.${this.name}`;
    }

    equals(obj: unknown): boolean {
        if (!(obj instanceof ColumnExpression)) return false;
        return this.equalsColumnExpression(obj);
    }

    equalsColumnExpression(other: ColumnExpression | null): boolean {
        return other !== null && this.alias === other.alias && this.name === other.name;
    }

    protected accept(visitor: DbExpressionVisitor): Expression {
        return visitor.visitColumn(this);
    }
}