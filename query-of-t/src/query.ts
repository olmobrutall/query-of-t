import { Quoted } from "quote-transformer/lib/quoted";
import { CallExpression, ConstantExpression, Expression, LambdaExpression, PropertyExpression } from "./expresions";
import { ArrayType, LiteralType as SimpleType, NewType, Type, FunctionType, ObjectType } from "./types";
import { lambdaType, resultType } from "./decorators";


export interface IQueryTranslator {
    execute(t: Expression): unknown;
    getQueryTextForDebug(t: Query<any>): string
}

export class Query<T> {

    get type(): ArrayType {
        var at = this.expression.type;
        if (!(at instanceof ArrayType))
            throw new Error("The type of the query should be an array");
        return at;

    }

    get elementType() {

        const at = this.type;
        if (at.elementType == null)
            throw new Error("The type of the query is an array but has an unknown element type");
        return at.elementType;
    }

    constructor(
        public readonly expression: Expression,
        public readonly translator: IQueryTranslator,
    ) {
    }

    toArray(): T[] {
        return this.translator.execute(this.expression) as T[];
    }

    queryTextForDebug(): string {
        return this.translator.getQueryTextForDebug(this);
    }

    @lambdaType(0, ot => [(ot as ArrayType).elementType])
    @resultType(ot => ot)
    filter(predicate: Quoted<(element: T) => boolean>): Query<T> {
        var lambda = Expression.fromQuotedLambda(predicate, [this.elementType]);
        var call = new CallExpression(
            new PropertyExpression(this.expression, "filter"),
            [lambda],
            this.type)
        return new Query<T>(call, this.translator);
    }

    @lambdaType(0, ot => [(ot as ArrayType).elementType])
    @resultType((ot, selType) => new ArrayType((selType as FunctionType).returnType))
    map<R>(selector: Quoted<(element: T) => R>): Query<R> {
        var lambda = Expression.fromQuotedLambda(selector, [this.elementType]);
        var call = new CallExpression(
            new PropertyExpression(this.expression, "map"),
            [lambda],
            new ArrayType(lambda.body.type!));
        return new Query<R>(call, this.translator);
    }

    @lambdaType(0, ot => [(ot as ArrayType).elementType])
    @resultType((ot, colSelType) => (colSelType as FunctionType).returnType)
    flatMap<R>(colSelector: Quoted<(element: T) => R[] | Query<R>>): Query<R> {
        var lambda = Expression.fromQuotedLambda(colSelector, [this.elementType]);

        if (!(lambda.body.type instanceof Array))
            throw new Error("colSelector should return an Array but returned " + (lambda.body.type?.toString() ?? "null"));
        var call = new CallExpression(
            new PropertyExpression(this.expression, "flatMap"),
            [lambda],
            lambda.body.type);
        return new Query<R>(call, this.translator);
    }

    @lambdaType(0, ot => [(ot as ArrayType).elementType])
    @resultType(ot => ot)
    orderBy(selector: Quoted<(element: T) => unknown>): OrderedQuery<T> {
        var lambda = Expression.fromQuotedLambda(selector, [this.elementType]);
        var call = new CallExpression(
            new PropertyExpression(this.expression, "orderBy"),
            [lambda],
            this.type);
        return new OrderedQuery<T>(call, this.translator);
    }

    @lambdaType(0, ot => [(ot as ArrayType).elementType])
    @resultType(ot => ot)
    orderByDescending(selector: Quoted<(element: T) => unknown>): OrderedQuery<T> {
        var lambda = Expression.fromQuotedLambda(selector, [this.elementType]);
        var call = new CallExpression(
            new PropertyExpression(this.expression, "orderByDescending"),
            [lambda],
            this.type);
        return new OrderedQuery<T>(call, this.translator);
    }

    @lambdaType(0, ot => [(ot as ArrayType).elementType])
    @resultType(ot => SimpleType.number)
    count<R>(predicate?: Quoted<(element: T) => boolean>): number {

        var lambda = predicate == null ? null : Expression.fromQuotedLambda(predicate, [this.elementType]);

        var call = new CallExpression(
            new PropertyExpression(this.expression, "count"),
            lambda ? [lambda] : [],
            SimpleType.number);

        return this.translator.execute(call) as number;
    }

    @lambdaType(0, ot => [(ot as ArrayType).elementType])
    @resultType(ot => SimpleType.boolean)
    some<R>(predicate?: Quoted<(element: T) => boolean>): boolean {

        var lambda = predicate == null ? null : Expression.fromQuotedLambda(predicate, [this.elementType]);

        var call = new CallExpression(
            new PropertyExpression(this.expression, "some"),
            lambda ? [lambda] : [],
            SimpleType.boolean);

        return this.translator.execute(call) as boolean;
    }

    @lambdaType(0, ot => [(ot as ArrayType).elementType])
    @resultType(ot => SimpleType.boolean)
    every<R>(predicate?: Quoted<(element: T) => boolean>): boolean {

        var lambda = predicate == null ? null : Expression.fromQuotedLambda(predicate, [this.elementType]);

        var call = new CallExpression(
            new PropertyExpression(this.expression, "every"),
            lambda ? [lambda] : [],
            SimpleType.boolean);

        return this.translator.execute(call) as boolean;
    }

    min(): T & (number | string | boolean | null | undefined);
    min<V extends (number | string | boolean | null | undefined)>(valueSelector: Quoted<(element: T) => V>): V;
    @lambdaType(0, ot => [(ot as ArrayType).elementType])
    @resultType((ot, selType) => selType ? (selType as FunctionType).returnType : (ot as ArrayType).elementType)
    min(valueSelector?: Quoted<(element: T) => unknown>): unknown {
        var lambda = valueSelector == null ? null : Expression.fromQuotedLambda(valueSelector, [this.elementType]);

        var call = new CallExpression(
            new PropertyExpression(this.expression, "min"),
            lambda ? [lambda] : [],
            lambda?.body.type ?? this.elementType);

        return this.translator.execute(call);
    }

    max(): T & (number | string | boolean | null | undefined);
    max<V extends (number | string | boolean | null | undefined)>(valueSelector: Quoted<(element: T) => V>): V;
    @lambdaType(0, ot => [(ot as ArrayType).elementType])
    @resultType((ot, selType) => selType ? (selType as FunctionType).returnType : (ot as ArrayType).elementType)
    max(valueSelector?: Quoted<(element: T) => unknown>): unknown {
        var lambda = valueSelector == null ? null : Expression.fromQuotedLambda(valueSelector, [this.elementType]);

        var call = new CallExpression(
            new PropertyExpression(this.expression, "max"),
            lambda ? [lambda] : [],
            lambda?.body.type ?? this.elementType);

        return this.translator.execute(call);
    }

    sum(): T & (number | null | undefined);
    sum<V extends (number | null | undefined)>(valueSelector: Quoted<(element: T) => V>): V;
    @lambdaType(0, ot => [(ot as ArrayType).elementType])
    @resultType((ot, at) => SimpleType.number)
    sum(valueSelector?: Quoted<(element: T) => unknown>): unknown {
        var lambda = valueSelector == null ? null : Expression.fromQuotedLambda(valueSelector, [this.elementType]);

        var call = new CallExpression(
            new PropertyExpression(this.expression, "sum"),
            lambda ? [lambda] : [],
            lambda?.body.type ?? this.elementType);

        return this.translator.execute(call);
    }

    avg(): T & (number | null | undefined);
    avg<V extends (number | null | undefined)>(valueSelector: Quoted<(element: T) => V>): V;
    @lambdaType(0, ot => [(ot as ArrayType).elementType])
    @resultType((ot, at) => SimpleType.number)
    avg(valueSelector?: Quoted<(element: T) => unknown>): unknown {
        var lambda = valueSelector == null ? null : Expression.fromQuotedLambda(valueSelector, [this.elementType]);

        var call = new CallExpression(
            new PropertyExpression(this.expression, "avg"),
            lambda ? [lambda] : [],
            lambda?.body.type ?? this.elementType);

        return this.translator.execute(call);
    }

    @resultType(ot => ot)
    top(count: number): Query<T> {
        var call = new CallExpression(
            new PropertyExpression(this.expression, "top"),
            [new ConstantExpression(count)],
            this.type);
        return new Query<T>(call, this.translator);
    }

    @resultType(ot => ot)
    skip(count: number): Query<T> {
        var call = new CallExpression(
            new PropertyExpression(this.expression, "skip"),
            [new ConstantExpression(count)],
            this.type);
        return new Query<T>(call, this.translator);
    }

    @lambdaType(0, ot => [(ot as ArrayType).elementType])
    @resultType(ot => (ot as ArrayType).elementType)
    first<R>(predicate?: Quoted<(element: T) => boolean>): T {

        var lambda = predicate == null ? null : Expression.fromQuotedLambda(predicate, [this.elementType]);

        var call = new CallExpression(
            new PropertyExpression(this.expression, "first"),
            lambda ? [lambda] : [],
            this.elementType);

        return this.translator.execute(call) as T;
    }

    @lambdaType(0, ot => [(ot as ArrayType).elementType])
    @resultType(ot => (ot as ArrayType).elementType)
    firstOrNull<R>(predicate?: Quoted<(element: T) => boolean>): T | null {

        var lambda = predicate == null ? null : Expression.fromQuotedLambda(predicate, [this.elementType]);

        var call = new CallExpression(
            new PropertyExpression(this.expression, "firstOrNull"),
            lambda ? [lambda] : [],
            this.elementType);

        return this.translator.execute(call) as T | null;
    }

    @lambdaType(0, ot => [(ot as ArrayType).elementType])
    @resultType(ot => (ot as ArrayType).elementType)
    last<R>(predicate?: Quoted<(element: T) => boolean>): T {

        var lambda = predicate == null ? null : Expression.fromQuotedLambda(predicate, [this.elementType]);

        var call = new CallExpression(
            new PropertyExpression(this.expression, "last"),
            lambda ? [lambda] : [],
            this.elementType);

        return this.translator.execute(call) as T;
    }

    @lambdaType(0, ot => [(ot as ArrayType).elementType])
    @resultType(ot => (ot as ArrayType).elementType)
    lastOrNull<R>(predicate?: Quoted<(element: T) => boolean>): T | null {

        var lambda = predicate == null ? null : Expression.fromQuotedLambda(predicate, [this.elementType]);

        var call = new CallExpression(
            new PropertyExpression(this.expression, "lastOrNull"),
            lambda ? [lambda] : [],
            this.elementType);

        return this.translator.execute(call) as T | null;
    }

    @lambdaType(0, ot => [(ot as ArrayType).elementType])
    @resultType(ot => (ot as ArrayType).elementType)
    single<R>(predicate?: Quoted<(element: T) => boolean>): T {

        var lambda = predicate == null ? null : Expression.fromQuotedLambda(predicate, [this.elementType]);

        var call = new CallExpression(
            new PropertyExpression(this.expression, "single"),
            lambda ? [lambda] : [],
            this.elementType);

        return this.translator.execute(call) as T;
    }

    @lambdaType(0, ot => [(ot as ArrayType).elementType])
    @resultType(ot => (ot as ArrayType).elementType)
    singleOrNull<R>(predicate?: Quoted<(element: T) => boolean>): T | null {

        var lambda = predicate == null ? null : Expression.fromQuotedLambda(predicate, [this.elementType]);

        var call = new CallExpression(
            new PropertyExpression(this.expression, "singleOrNull"),
            lambda ? [lambda] : [],
            this.elementType);

        return this.translator.execute(call) as T | null;
    }

    @resultType(ot => ot)
    nullIfEmpty(): Query<T | null> {
        var call = new CallExpression(
            new PropertyExpression(this.expression, "nullIfEmpty"),
            [],
            this.type);
        return new Query<T>(call, this.translator);
    }


    @resultType(ot => ot)
    distinct(): Query<T> {
        var call = new CallExpression(
            new PropertyExpression(this.expression, "distinct"),
            [],
            this.type);
        return new Query<T>(call, this.translator);
    }

    groupBy<K>(keySelector: Quoted<(element: T) => K>): Query<{ key: K, elements: T[] }>;
    groupBy<K, E>(keySelector: Quoted<(element: T) => K>, elementSelector: Quoted<(element: T) => E>): Query<{ key: K, elements: E[] }>;


    @lambdaType(0, ot => [(ot as ArrayType).elementType])
    @lambdaType(1, ot => [(ot as ArrayType).elementType])
    @resultType((ot, keyType, elemType) => new ObjectType({
        key: (keyType as FunctionType).returnType,
        elements: elemType ? new ArrayType(elemType) : ot
    }))
    groupBy(keySelector: Quoted<(element: T) => unknown>, elementSelector?: Quoted<(element: T) => unknown>): Query<{ key: unknown, elements: unknown[] }> {
        var lambdaKey = Expression.fromQuotedLambda(keySelector, [this.elementType]);
        var lambdaElement = elementSelector == null ? null : Expression.fromQuotedLambda(keySelector, [this.elementType]);

        var call = new CallExpression(
            new PropertyExpression(this.expression, "groupBy"),
            lambdaElement == null ? [lambdaKey] : [lambdaKey, lambdaElement],
            this.expression.type!);

        return new Query<{ key: unknown, elements: unknown[] }>(call, this.translator);
    }


    @lambdaType(1, ot => [(ot as ArrayType).elementType])
    @lambdaType(2, (ot, other) => [(other as ArrayType).elementType])
    @lambdaType(3, (ot, other) => [(ot as ArrayType).elementType, (other as ArrayType).elementType])
    @resultType((ot, other, key, otherKey, result) => new ArrayType((result as FunctionType).returnType))
    join<K, O, R>(
        otherSource: Query<O>,
        keySelector: Quoted<(element: T) => K>,
        otherKeySelector: Quoted<(otherElement: O) => K>,
        resultSelector: Quoted<(element: T, otherElement: O) => R>
    ): Query<R> {
        var lambdaKey = Expression.fromQuotedLambda(keySelector, [this.elementType]);
        var lambdaOtherKey = Expression.fromQuotedLambda(otherKeySelector, [otherSource.elementType]);
        var lambdaResult = Expression.fromQuotedLambda(resultSelector, [this.elementType, otherSource.elementType]);

        var call = new CallExpression(
            new PropertyExpression(this.expression, "join"),
            [lambdaKey, lambdaOtherKey, lambdaResult],
            this.expression.type!);

        return new Query<R>(call, this.translator);
    }
}

export class OrderedQuery<T> extends Query<T> {

    @lambdaType(0, ot => [(ot as ArrayType).elementType])
    @resultType(ot => ot)
    thenBy(selector: Quoted<(value: T) => unknown>): Query<T> {
        var lambda = Expression.fromQuotedLambda(selector, [this.elementType]);
        var call = new CallExpression(
            new PropertyExpression(this.expression, "thenBy"),
            [lambda],
            this.type);
        return new Query<T>(call, this.translator);
    }

    @lambdaType(0, ot => [(ot as ArrayType).elementType])
    @resultType(ot => ot)
    thenByDescending(selector: Quoted<(value: T) => unknown>): Query<T> {
        var lambda = Expression.fromQuotedLambda(selector, [this.elementType]);
        var call = new CallExpression(
            new PropertyExpression(this.expression, "thenByDescending"),
            [lambda],
            this.type);
        return new Query<T>(call, this.translator);
    }
}