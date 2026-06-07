export type InitValues<T> = Partial<{
    [K in keyof T as T[K] extends Function ? never : K]: T[K]
}>;

export abstract class ModifiableEntity {
    mixin<M>(mixinClass: new () => M): M {
        return this as unknown as M;
    }

    init(values: InitValues<this>): this {
        Object.assign(this, values);
        return this;
    }
}
