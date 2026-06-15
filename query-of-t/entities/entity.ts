
import type { Lite } from './lite';
import { entity, EntityData, ignore } from './decorators';

export type PrimaryKey = string | number;

export type InitValues<T> = Partial<{
    [K in keyof T as T[K] extends Function ? never : K]: T[K]
}>;

export abstract class BaseEntity {
    mixin<M>(mixinClass: new () => M): M {
        return this as unknown as M;
    }

    init(values: InitValues<this>): this {
        Object.assign(this, values);
        return this;
    }
}

export type EntitySnapshot = Record<string, unknown>;

@entity()
export abstract class Entity extends BaseEntity {
    id: PrimaryKey;
    @ignore isNew: boolean;
    ticks: number;
    _snapshot?: EntitySnapshot;

    toLite(): Lite<this> {
        throw new Error('toLite requires LiteImp and schema — implemented in Phase B/C');
    }

    isDirty(): boolean {
        if (this._snapshot == null) return this.isNew;
        return false;
    }
}

export abstract class EmbeddedEntity extends BaseEntity { }

export abstract class ModelEntity extends BaseEntity { }
