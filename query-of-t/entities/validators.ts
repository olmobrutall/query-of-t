
import { getOrCreateTypeInfo, getOrCreateFieldInfo, Validator } from './reflection';
import type { FieldInfo } from './reflection';
import type { BaseEntity } from './entity';
import { msg } from './utils/localization';

export { Validator } from './reflection';

export const ValidationMessage = {
    _0MustHaveAtMost1Characters: msg(),
    _0MustHaveAtLeast1Characters: msg(),
    _0DoesNotHaveAValid1Format: msg(),
    _0HasSomeRepeatedElements1: msg("{0} has some repeated elements: {1}"),
};

function addValidator(context: ClassFieldDecoratorContext, validator: Validator): void {
    const key = String(context.name);
    const typeInfo = getOrCreateTypeInfo(context.metadata!);
    getOrCreateFieldInfo(typeInfo, key).validators.push(validator);
}

// --- fieldValidation ---

export function customValidators<T>(fn: (entity: T, fi: FieldInfo) => string | null) {
    return (_value: undefined, context: ClassFieldDecoratorContext) => {
        const key = String(context.name);
        const typeInfo = getOrCreateTypeInfo(context.metadata!);
        getOrCreateFieldInfo(typeInfo, key).customValidation = fn;
    };
}

// --- StringLengthValidator ---

export interface StringLengthOptions {
    min?: number;
    max?: number;
    allowNulls?: boolean;
}

export function stringLengthValidator(options: StringLengthOptions = {}) {
    return (_value: undefined, context: ClassFieldDecoratorContext) => addValidator(context, new StringLengthValidator(options));
}

export class StringLengthValidator extends Validator {
    constructor(public readonly options: StringLengthOptions = {}) { super(); }

    isCompatibleWith(type: Function) { return type === String; }

    get helpMessage(): string {
        const { min, max } = this.options;
        if (min != null && max != null) return `have between ${min} and ${max} characters`;
        if (min != null) return `have at least ${min} characters`;
        if (max != null) return `have at most ${max} characters`;
        return 'be a string';
    }

    protected overrideError(value: unknown, _entity: BaseEntity, fi: FieldInfo): string | null {
        const s = value as string | null | undefined;
        if (s == null || s === '') return null;
        const { min, max } = this.options;
        if (max != null && s.length > max)
            return ValidationMessage._0MustHaveAtMost1Characters.niceToString(fi.niceToString(), max);
        if (min != null && s.length < min)
            return ValidationMessage._0MustHaveAtLeast1Characters.niceToString(fi.niceToString(), min);
        return null;
    }
}

// --- UrlValidator ---

const urlRegex = /^(https?:\/\/)[^\s/$.?#].[^\s]*$/i;

export function urlValidator() {
    return (_value: undefined, context: ClassFieldDecoratorContext) => addValidator(context, new UrlValidator());
}

export class UrlValidator extends Validator {
    isCompatibleWith(type: Function) { return type === String; }
    get helpMessage() { return 'be a valid URL'; }

    protected overrideError(value: unknown, _entity: BaseEntity, fi: FieldInfo): string | null {
        const s = value as string | null | undefined;
        if (s == null || s === '') return null;
        return urlRegex.test(s) ? null : ValidationMessage._0DoesNotHaveAValid1Format.niceToString(fi.niceToString(), 'URL');
    }
}

// --- TelephoneValidator ---

const telephoneRegex = /^[\d+\-/() ]+$/;

export function telephoneValidator() {
    return (_value: undefined, context: ClassFieldDecoratorContext) => addValidator(context, new TelephoneValidator());
}

export class TelephoneValidator extends Validator {
    isCompatibleWith(type: Function) { return type === String; }
    get helpMessage() { return 'be a valid telephone number'; }

    protected overrideError(value: unknown, _entity: BaseEntity, fi: FieldInfo): string | null {
        const s = value as string | null | undefined;
        if (s == null || s === '') return null;
        return telephoneRegex.test(s) ? null : ValidationMessage._0DoesNotHaveAValid1Format.niceToString(fi.niceToString(), 'telephone number');
    }
}

// --- EmailValidator ---

const emailRegex = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/i;

export function emailValidator() {
    return (_value: undefined, context: ClassFieldDecoratorContext) => addValidator(context, new EmailValidator());
}

export class EmailValidator extends Validator {
    isCompatibleWith(type: Function) { return type === String; }
    get helpMessage() { return 'be a valid e-mail address'; }

    protected overrideError(value: unknown, _entity: BaseEntity, fi: FieldInfo): string | null {
        const s = value as string | null | undefined;
        if (s == null || s === '') return null;
        return emailRegex.test(s) ? null : ValidationMessage._0DoesNotHaveAValid1Format.niceToString(fi.niceToString(), 'e-mail address');
    }
}

// --- NoRepeatValidator ---

export function noRepeatValidator() {
    return (_value: undefined, context: ClassFieldDecoratorContext) => addValidator(context, new NoRepeatValidator());
}

export class NoRepeatValidator extends Validator {
    isCompatibleWith(type: Function) { return type === Array; }
    get helpMessage() { return 'have no repeated elements'; }

    protected overrideError(value: unknown, _entity: BaseEntity, fi: FieldInfo): string | null {
        const list = value as unknown[] | null | undefined;
        if (list == null || list.length <= 1) return null;
        const seen = new Set<unknown>();
        const repeated: unknown[] = [];
        for (const item of list) {
            if (seen.has(item)) repeated.push(item);
            else seen.add(item);
        }
        return repeated.length > 0
            ? ValidationMessage._0HasSomeRepeatedElements1.niceToString(fi.niceToString(), repeated.join(', '))
            : null;
    }
}
