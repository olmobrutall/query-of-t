
import { getOrCreateFieldInfo, getOrCreateTypeInfo } from "../entities/reflection";
import type { ColumnOptions } from "../entities/reflection";

export { ColumnOptions };

export class ObjectName {
    constructor(
        public readonly name: string,
        public readonly schema: SchemaName) {
    }
}

export class SchemaName {
    constructor(
        public readonly name: string,
        public readonly database: DatabaseName
    ) {
    }
}

export class DatabaseName {
    constructor(
        public readonly name: string,
    ) {
    }
}

export class Column {
    constructor(
        public readonly name: string,
        public readonly pgDbType?: string,
        public readonly sqlDbType?: string,
        public readonly size?: number,
        public readonly precision?: number,
        public readonly nullable?: boolean,
        public readonly collection?: boolean,
        public readonly ignored?: boolean,
    ) {
    }
}

export class Table {
    constructor() {
        this.columns = {};
    }

    columns: { [columnName: string]: Column };
}

export function column(options: ColumnOptions = {}) {
    return function (_value: unknown, context: ClassFieldDecoratorContext | ClassAccessorDecoratorContext) {
        if (context.metadata == null)
            throw new Error("Decorator metadata is required but not available in this runtime");

        const key = String(context.name);
        const normalizedOptions: ColumnOptions = {
            ...options,
            columnName: options.columnName ?? key,
        };

        const typeInfo = getOrCreateTypeInfo(context.metadata);
        const existing = getOrCreateFieldInfo(typeInfo, key);
        existing.columnOptions = normalizedOptions;
        typeInfo.fields[key] = existing;
    };
}
