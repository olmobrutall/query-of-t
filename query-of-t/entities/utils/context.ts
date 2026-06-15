
export interface IContextVariable<T> {
    /** Runs fn with this variable bound to value. fn must be synchronous on the browser. */
    withValue<R>(value: T, fn: () => R): R;
    /** Returns the current value, or undefined if called outside a withValue scope (or before setValue). */
    getValue(): T | undefined;
    /**
     * Globally sets the variable.
     * Supported on the browser only — throws on the server.
     * Use withValue to scope context to a request on the server.
     */
    setValue(value: T | undefined): void;
}

export interface IContextStorage {
    newContextVariable<T>(): IContextVariable<T>;
}

/**
 * The active context storage for this environment.
 * Replaced at startup by the first line of context.node.ts or context.browser.ts.
 * Throws if called before either has been imported.
 */
export const Statics: IContextStorage = {
    newContextVariable<T>(): IContextVariable<T> {
        throw new Error(
            'No context storage registered. ' +
            'Import context.node.ts (server) or context.browser.ts (browser) ' +
            'as the first import in your entry point.'
        );
    },
};
