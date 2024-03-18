import { LambdaTypeResolver, StaticFunction, resultType } from "./decorators";
import { CallExpression, ConstantExpression, Expression } from "./expresions";
import { IQueryTranslator, Query } from "./query";
import { ArrayType, FunctionType, NewType, Type } from "./types";
import { expressionSimplifier } from "./visitors/expressionSimplifier";

export abstract class Entity {

}


export function table<T extends Entity>(entityType: { new(): T }): Query<T> {
    var arrayType = new ArrayType(new NewType(entityType));
    var callExpression = new CallExpression(
        new ConstantExpression(table, new FunctionType(table, arrayType)),
        [new ConstantExpression(entityType, new FunctionType(entityType, new NewType(entityType)))],
        arrayType
    );
    return new Query<T>(callExpression, MyQueryTranslator.instance);
}

(table as StaticFunction).__resultType = (_, entityTypeType) => new ArrayType(new NewType((entityTypeType as FunctionType).func!));


class MyQueryTranslator implements IQueryTranslator {

    static instance: IQueryTranslator = new MyQueryTranslator();
    execute(expression: Expression): unknown {
        return this.translate(expression, tr => tr.execute());
    }
    getQueryTextForDebug(query: Query<any>): string {
        return this.translate(query.expression, tr => tr.query + "\nParameters:\n" + JSON.stringify(tr.parameters));
    }

    translate<T>(expression: Expression, continuation: (tr: TranslateResult) => T): T {

        var simplify = expressionSimplifier()(expression);



        throw new Error("Not implemented");
    }
}




class TranslateResult {

    constructor(
        public query: string,
        public parameters: unknown[],
        public projector: (row: unknown) => unknown
    ) {

    }

    execute() {
        return Connector.current().executeQuery(this.query, this.parameters);
    }
}

export abstract class Connector {

    static current() {
        return this.global;
    }

    static global: Connector = null!;
    abstract executeQuery(sql: string, parameters: unknown[]): Promise<unknown[]>;
}

