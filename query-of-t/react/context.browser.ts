
import { Statics } from '../entities/utils/context';

Statics.newContextVariable = <T>() => {
    let current: T | undefined = undefined;
    return {
        withValue<R>(value: T, fn: () => R): R {
            const previous = current;
            current = value;
            try {
                const result = fn();
                if (result instanceof Promise)
                    throw new Error(
                        'BrowserContextVariable does not support async callbacks — use setValue instead'
                    );
                return result;
            } finally {
                current = previous;
            }
        },
        getValue(): T | undefined {
            return current;
        },
        setValue(value: T | undefined): void {
            current = value;
        },
    };
};
