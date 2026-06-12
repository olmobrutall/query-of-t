import type { ColumnOptions } from './schema';
import type { Validator } from './validators';
import { DescriptionManager } from './utils/localization';

export type ImplementationsInfo =
    | { kind: 'implementedBy'; types: (new () => unknown)[] }
    | { kind: 'implementedByAll' };


export interface FieldOptions {
    name?: string;
    nullable?: boolean;
    container?: () => unknown;
}

export class FieldInfo {
    type: () => unknown = () => Object;
    containerType?: () => unknown;
    kind?: string;
    isNullable?: boolean;
    fkPropertyName?: string;
    implementations?: ImplementationsInfo;
    columnOptions?: ColumnOptions;

    validators: Validator[] = [];
    customValidation?: (entity: any, fieldInfo: FieldInfo) => string | null;

    constructor(readonly name: string) { }

    niceToString(): string {
        return DescriptionManager.inferDescription(this.name);
    }
}

export class TypeInfo {
    constructor() {
        this.fields = {};
    }

    fields: { [fieldName: string]: FieldInfo };
}

const symbolWithMetadata = Symbol as any;
if (symbolWithMetadata.metadata == null) {
    symbolWithMetadata.metadata = Symbol.for('Symbol.metadata');
}

const metadataSymbol: symbol = symbolWithMetadata.metadata;
const typeInfoMetadataKey = Symbol.for('query-of-t:typeInfo');

export function getOrCreateTypeInfo(metadata: DecoratorMetadataObject): TypeInfo {
    const existing = metadata[typeInfoMetadataKey] as TypeInfo | undefined;
    if (existing)
        return existing;

    const created = new TypeInfo();
    metadata[typeInfoMetadataKey] = created;
    return created;
}

export function getOrCreateFieldInfo(typeInfo: TypeInfo, key: string): FieldInfo {
    const existing = typeInfo.fields[key];
    if (existing) return existing;
    const created = new FieldInfo(key);
    typeInfo.fields[key] = created;
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
    if (value == null || typeof value !== 'object')
        return false;

    const kind = (value as any).kind;
    return kind === 'field' || kind === 'accessor';
}

export function field(value: undefined, context: ClassFieldDecoratorContext | ClassAccessorDecoratorContext): void;
export function field(type: () => unknown, options?: FieldOptions): (value: unknown, context: ClassFieldDecoratorContext | ClassAccessorDecoratorContext) => void;
export function field(arg1: unknown, arg2?: unknown): unknown {
    if (isFieldContext(arg2)) {
        throw new Error('@field without type should be rewritten by the compiler to @field(() => Type)');
    }

    if (typeof arg1 !== 'function')
        throw new Error('@field expects a type factory: @field(() => Type)');

    const typeFactory = arg1 as () => unknown;
    const options = (arg2 != null && typeof arg2 === 'object') ? arg2 as FieldOptions : undefined;

    return function (_value: unknown, context: ClassFieldDecoratorContext | ClassAccessorDecoratorContext) {
        if (context.metadata == null)
            throw new Error('Decorator metadata is required but not available in this runtime');

        const key = String(context.name);
        const typeInfo = getOrCreateTypeInfo(context.metadata);
        const fi = getOrCreateFieldInfo(typeInfo, key);
        fi.type = typeFactory;
        if (options?.name != null)
            fi.kind = options.name;
        if (options?.nullable != null)
            fi.isNullable = options.nullable;
        if (options?.container != null)
            fi.containerType = options.container;
    };
}
