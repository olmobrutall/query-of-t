import type { ColumnOptions } from "./schema";

export interface FieldInfo {
    name: string;
    type?: () => Function;
    isNullable?: boolean;
    isCollection?: boolean;
    isIgnored?: boolean;
    columnOptions?: ColumnOptions;
}

export class TypeInfo {

    constructor() {
        this.fields = {};
    }

    fields: { [fieldName: string]: FieldInfo };
}

const symbolWithMetadata = Symbol as any;
if (symbolWithMetadata.metadata == null) {
    symbolWithMetadata.metadata = Symbol.for("Symbol.metadata");
}

const metadataSymbol: symbol = symbolWithMetadata.metadata;
const typeInfoMetadataKey = Symbol.for("query-of-t:typeInfo");



export function getOrCreateTypeInfo(metadata: DecoratorMetadataObject): TypeInfo {
    const existing = metadata[typeInfoMetadataKey] as TypeInfo | undefined;
    if (existing)
        return existing;

    const created = new TypeInfo();
    metadata[typeInfoMetadataKey] = created;
    return created;
}



function getMetadata(target: any): DecoratorMetadataObject | undefined {
    return target?.[metadataSymbol] ?? target?.constructor?.[metadataSymbol];
}

export function getTypeInfo(target: object): TypeInfo | undefined {
    const metadata = getMetadata(target as any);
    return metadata?.[typeInfoMetadataKey] as TypeInfo | undefined;
}

function isFieldContext(value: unknown): value is ClassFieldDecoratorContext | ClassAccessorDecoratorContext {
    if (value == null || typeof value !== "object")
        return false;

    const kind = (value as any).kind;
    return kind == "field" || kind == "accessor";
}

export function field(value: undefined, context: ClassFieldDecoratorContext | ClassAccessorDecoratorContext): void;
export function field(type: () => Function): (value: unknown, context: ClassFieldDecoratorContext | ClassAccessorDecoratorContext) => void;
export function field(arg1: unknown, arg2?: unknown): unknown {
    if (isFieldContext(arg2)) {
        throw new Error("@field without type should be rewritten by the compiler to @field(() => Type)");
    }

    if (typeof arg1 !== "function")
        throw new Error("@field expects a type factory: @field(() => Type)");

    const typeFactory = arg1 as () => Function;
    return function (_value: unknown, context: ClassFieldDecoratorContext | ClassAccessorDecoratorContext) {
        if (context.metadata == null)
            throw new Error("Decorator metadata is required but not available in this runtime");

        const key = String(context.name);
        const typeInfo = getOrCreateTypeInfo(context.metadata);
        const existing = typeInfo.fields[key] ?? { name: key } as FieldInfo;
        existing.name = key;
        existing.type = typeFactory;
        typeInfo.fields[key] = existing;
    };
}
