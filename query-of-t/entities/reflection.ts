
import { DescriptionManager } from './utils/localization';

// ColumnOptions lives here (shared) so logic/schema.ts can import it without
// the entities package depending on server-only code.
export interface ColumnOptions {
    columnName?: string;
    pgDbType?: string;
    sqlDbType?: string;
    nullable?: boolean;
    collection?: boolean;
    ignored?: boolean;
    size?: number;
    precision?: number;
}

export type ImplementationsInfo =
    | { kind: 'implementedBy'; types: (new () => unknown)[] }
    | { kind: 'implementedByAll' };


export interface FieldOptions {
    name?: string;
    nullable?: boolean;
    container?: () => unknown;
}

export class FieldInfo {
    readonly name: string;
    type: () => unknown = () => Object;
    containerType?: () => unknown;
    kind?: string;
    isNullable?: boolean;
    ignore: boolean = false;
    fkPropertyName?: string;
    implementations?: ImplementationsInfo;
    columnOptions?: ColumnOptions;

    validators: Validator[] = [];
    customValidation?: (entity: any, fieldInfo: FieldInfo) => string | null;

    constructor(name: string) {
        this.name = name;
    }

    niceToString(): string {
        return DescriptionManager.inferDescription(this.name);
    }
}

// Validator is declared here (forward-reference) to break the circular dep
// between reflection ↔ validators.  The full implementations live in validators.ts.
export abstract class Validator {
    isApplicable?: (entity: any) => boolean;
    customError?: () => string;

    abstract get helpMessage(): string;
    isCompatibleWith?(type: Function): boolean;

    protected abstract overrideError(value: unknown, entity: any, fieldName: FieldInfo): string | null;

    error(value: unknown, entity: any, fieldName: FieldInfo): string | null {
        if (this.isApplicable != null && !this.isApplicable(entity)) return null;
        const result = this.overrideError(value, entity, fieldName);
        if (result == null) return null;
        return this.customError != null ? this.customError() : result;
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

function isFieldContext(value: unknown): value is ClassFieldDecoratorContext {
    if (value == null || typeof value !== 'object')
        return false;

    const kind = (value as any).kind;
    return kind === 'field' || kind === 'accessor';
}

export function field(value: undefined, context: ClassFieldDecoratorContext): void;
export function field(type: () => unknown, options?: FieldOptions): (value: unknown, context: ClassFieldDecoratorContext | ClassAccessorDecoratorContext) => void;
export function field(arg1: unknown, arg2?: unknown): unknown {
    if (isFieldContext(arg2)) {
        throw new Error('@field without type should be rewritten by the compiler to @field(() => Type)');
    }

    if (typeof arg1 !== 'function')
        throw new Error('@field expects a type factory: @field(() => Type)');

    const typeFactory = arg1 as () => unknown;
    const options = (arg2 != null && typeof arg2 === 'object') ? arg2 as FieldOptions : undefined;

    return function (_value: unknown, context: ClassFieldDecoratorContext) {
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
