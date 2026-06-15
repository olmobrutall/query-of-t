
import { AsyncLocalStorage } from 'node:async_hooks';
import { Statics } from '../entities/utils/context';

Statics.newContextVariable = <T>() => {
    const storage = new AsyncLocalStorage<T>();
    return {
        withValue<R>(value: T, fn: () => R): R {
            return storage.run(value, fn);
        },
        getValue(): T | undefined {
            return storage.getStore();
        },
        setValue(_value: T | undefined): void {
            throw new Error(
                'setValue is not supported on the server — use withValue to scope context to a request'
            );
        },
    };
};
