import { FieldInfo, getOrCreateTypeInfo } from "./reflection";

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
        const existing = (typeInfo.fields[key] ?? { name: key }) as FieldInfo;
        existing.name = key;
        existing.columnOptions = normalizedOptions;
        typeInfo.fields[key] = existing;
    };
}
