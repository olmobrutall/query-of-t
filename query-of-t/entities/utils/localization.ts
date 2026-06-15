
import type { IContextVariable, IContextStorage } from './context';

export class LocalizableMessage {
    private _inferred?: string;

    constructor(
        readonly defaultDescription: string | undefined,
        readonly member: string | undefined,
        readonly module: string | undefined,
    ) { }

    niceToString(...args: unknown[]): string {
        const template = DescriptionManager.lookup(this) ?? this._getDefault();
        return args.length > 0 ? format(template, ...args) : template;
    }

    private _getDefault(): string {
        if (this.defaultDescription != null) return this.defaultDescription;
        if (this.member == null) return '?';
        return this._inferred ??= DescriptionManager.inferDescription(this.member);
    }
}

// Overload seen by developers — desc optional, member/module injected by transformer
export function msg(desc?: string): LocalizableMessage;
// Full signature used by transformer-generated code
export function msg(desc: string | undefined, member: string, module: string): LocalizableMessage;
export function msg(desc?: string, member?: string, module?: string): LocalizableMessage {
    return new LocalizableMessage(desc, member, module);
}

function format(template: string, ...args: unknown[]): string {
    return template.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)] ?? ''));
}

export namespace DescriptionManager {
    // Process-wide defaults
    let _defaultCulture = 'en';
    let _defaultUICulture = 'en';

    // Per-async-context overrides — backed by IContextVariable so the
    // implementation works on both Node (AsyncLocalStorage) and browser (global var).
    // Call initLocalizationContext(Statics) once at application startup.
    let _cultureVar: IContextVariable<string> | undefined;
    let _uiCultureVar: IContextVariable<string> | undefined;

    export function initLocalizationContext(storage: IContextStorage): void {
        _cultureVar = storage.newContextVariable<string>();
        _uiCultureVar = storage.newContextVariable<string>();
    }

    export function currentCulture(): string { return _cultureVar?.getValue() ?? _defaultCulture; }
    export function currentUICulture(): string { return _uiCultureVar?.getValue() ?? _defaultUICulture; }

    export function setDefaultCulture(locale: string): void { _defaultCulture = locale; }
    export function setDefaultUICulture(locale: string): void { _defaultUICulture = locale; }

    export function withCulture<T>(locale: string, fn: () => T): T {
        if (_cultureVar == null)
            throw new Error('Call DescriptionManager.initLocalizationContext(Statics) before using withCulture');
        return _cultureVar.withValue(locale, fn);
    }

    export function withUICulture<T>(locale: string, fn: () => T): T {
        if (_uiCultureVar == null)
            throw new Error('Call DescriptionManager.initLocalizationContext(Statics) before using withUICulture');
        return _uiCultureVar.withValue(locale, fn);
    }

    export function withCultures<T>(locale: string, fn: () => T): T {
        return withCulture(locale, () => withUICulture(locale, fn));
    }

    const _translations = new Map<string, Record<string, string>>();

    export function addTranslations(locale: string, dict: Record<string, string>): void {
        const existing = _translations.get(locale);
        _translations.set(locale, existing ? { ...existing, ...dict } : { ...dict });
    }

    export function lookup(msg: LocalizableMessage): string | undefined {
        if (msg.module == null || msg.member == null) return undefined;
        const key = `${msg.module}.${msg.member}`;
        return _translations.get(currentUICulture())?.[key];
    }

    // Infers a human-readable description from a member name.
    // Strips a leading '_', splits on PascalCase boundaries, lowercases,
    // and replaces each digit N with the placeholder {N}.
    // e.g. "_0IsNotSet" → "{0} is not set", "BeNotNull" → "be not null"
    export function inferDescription(member: string): string {
        const s = member.startsWith('_') ? member.slice(1) : member;
        const tokens: string[] = [];
        let i = 0;
        while (i < s.length) {
            const ch = s[i];
            if (ch >= '0' && ch <= '9') {
                tokens.push(`{${ch}}`);
                i++;
                continue;
            }
            let word = ch.toLowerCase();
            i++;
            while (i < s.length && !(s[i] >= '0' && s[i] <= '9') && s[i] === s[i].toLowerCase()) {
                word += s[i];
                i++;
            }
            tokens.push(word);
        }
        return tokens.join(' ');
    }
}
