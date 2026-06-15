export type int = number & { readonly __brand: 'int' };
export type long = number & { readonly __brand: 'long' };

export function toInt(n: number): int {
    return Math.trunc(n) as int;
}

export function toLong(n: number): long {
    return Math.trunc(n) as long;
}

export { Temporal } from 'temporal-polyfill';
export { Decimal } from 'decimal.js';
