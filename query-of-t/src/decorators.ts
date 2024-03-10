import "reflect-metadata";
import { Entity } from "./table";
import { Type, LiteralType, ArrayType, NewType } from "./types";
import { ExLambda } from "quote-transformer/lib/quoted";


export class TableInfo {

    constructor() {
        this.columns = {};
    }
    columns: { [columnName: string]: ColumnInfo };
}

interface ColumnInfo {
    type: Type;
    columnName: string;
}

export function column(options?: { columnName?: string; type?: Type }) {
    return function (target: any, key: string) {
        // Retrieve existing columns from metadata or create an empty array
        const tableInfo: TableInfo = Reflect.getMetadata('tableInfo', target) || new TableInfo();

        var tsType = Reflect.getMetadata('design:type', target, key);

        var ci: ColumnInfo = {
            columnName: options?.columnName ?? key,
            type: options?.type ?? toRuntimeType(tsType)!,
        };

        tableInfo.columns[key] = ci;

        Reflect.defineMetadata('columns', tableInfo, target);
    };
}

export function quoted(exp?: () => ExLambda) {
    return function (target: any, key: string) {

        if (exp == undefined)
            throw new Error(`Unable to add the quoted expression to "${target.name}". Are you using ts-path and quote-transformer?`);

        Reflect.defineMetadata('quoted', exp, target);
    };
}

export type LambdaTypeResolver = (objectType: Type, ...argsTypes: Type[]) => Type[];

export function lambdaType(paramNumber: number, typeResolver: LambdaTypeResolver) {
    return function (target: any, key: string) {

        var lambdaParams = (Reflect.getMetadata('lambdaParams', target) ?? []) as LambdaTypeResolver[];
        lambdaParams[paramNumber] = typeResolver;

        Reflect.defineMetadata('lambdaParams', lambdaParams, target);
    };
}

export type ResultTypeResolver = (objectType: Type, ...argsTypes: Type[]) => Type;

export function resultType(typeResolver: ResultTypeResolver) {
    return function (target: any, key: string) {
        Reflect.defineMetadata('resultType', typeResolver, target);
    };
}


function toRuntimeType(tsTyp: any): Type | undefined {

    if (tsTyp == "boolean")
        return LiteralType.boolean;
    if (tsTyp == "number")
        return LiteralType.number;
    if (tsTyp == "string")
        return LiteralType.string;
    if (tsTyp == Array)
        return undefined;
    if (tsTyp == Object)
        return undefined;
    return new NewType(tsTyp);
}

