import { field } from '../reflection';
import { ModifiableEntity } from './modifiable';
import type { Lite } from './lite';
import type { PrimaryKey } from './primaryKey';

export type { PrimaryKey };

export type EntitySnapshot = Record<string, unknown>;

export abstract class Entity extends ModifiableEntity {
    @field id: PrimaryKey;
    @field isNew: boolean;
    @field ticks: number;
    _snapshot?: EntitySnapshot;

    toLite(): Lite<this> {
        throw new Error('toLite requires LiteImp and schema — implemented in Phase B/C');
    }

    isDirty(): boolean {
        if (this._snapshot == null) return this.isNew;
        return false;
    }
}

export abstract class EmbeddedEntity extends ModifiableEntity { }

export abstract class ModelEntity extends ModifiableEntity { }
