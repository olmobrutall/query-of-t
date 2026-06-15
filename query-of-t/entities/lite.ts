
import type { Entity, PrimaryKey } from './entity';

export abstract class Lite<out T extends Entity> {
    abstract readonly id: PrimaryKey;
    abstract readonly entityType: new () => T;
    abstract toString(): string;

    is(other: Lite<Entity>): boolean {
        return this.id === other.id && this.entityType === other.entityType;
    }
}

export class LiteImp<T extends Entity> extends Lite<T> {
    constructor(
        readonly id: PrimaryKey,
        readonly entityType: new () => T,
        readonly toStr: string,
    ) {
        super();
    }

    toString(): string {
        return this.toStr;
    }
}
