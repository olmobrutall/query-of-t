import { getOrCreateTypeInfo, getOrCreateFieldInfo } from './reflection';

export {
    stringLengthValidator, urlValidator, telephoneValidator,
    emailValidator, noRepeatValidator,
    customValidators as fieldValidation,
} from './validators';

export enum EntityKind {
    SystemString = 'SystemString',
    System = 'System',
    Relational = 'Relational',
    String = 'String',
    Shared = 'Shared',
    Main = 'Main',
    Part = 'Part',
    SharedPart = 'SharedPart',
}

export enum EntityData {
    Transactional = 'Transactional',
    Master = 'Master',
}

export interface EntityInfo {
    kind?: EntityKind;
    data?: EntityData;
}

const symbolWithMetadata = Symbol as any;
if (symbolWithMetadata.metadata == null) {
    symbolWithMetadata.metadata = Symbol.for('Symbol.metadata');
}
const metadataSymbol: symbol = symbolWithMetadata.metadata;

const entityInfoKey = Symbol.for('query-of-t:entityInfo');
const allowUnauthenticatedKey = Symbol.for('query-of-t:allowUnauthenticated');

export function entity(options: EntityInfo = {}) {
    return function (target: Function): void {
        const metadata = (target as any)[metadataSymbol];
        if (metadata != null)
            metadata[entityInfoKey] = options;
    };
}

export function allowUnauthenticated(target: Function): void {
    const metadata = (target as any)[metadataSymbol];
    if (metadata != null)
        metadata[allowUnauthenticatedKey] = true;
}

export function ignore(_value: undefined, _context: ClassFieldDecoratorContext): void {
    // Field is intentionally excluded from schema — no FieldInfo registered
}

export function fkProperty(propertyName: string) {
    return function (_value: undefined, context: ClassFieldDecoratorContext): void {
        const key = String(context.name);
        const typeInfo = getOrCreateTypeInfo(context.metadata!);
        getOrCreateFieldInfo(typeInfo, key).fkPropertyName = propertyName;
    };
}

export function implementedBy(types: () => (new () => unknown)[]) {
    return function (_value: undefined, context: ClassFieldDecoratorContext): void {
        const key = String(context.name);
        const typeInfo = getOrCreateTypeInfo(context.metadata!);
        getOrCreateFieldInfo(typeInfo, key).implementations = { kind: 'implementedBy', types: types() };
    };
}

export function implementedByAll(_value: undefined, context: ClassFieldDecoratorContext): void {
    const key = String(context.name);
    const typeInfo = getOrCreateTypeInfo(context.metadata!);
    getOrCreateFieldInfo(typeInfo, key).implementations = { kind: 'implementedByAll' };
}



