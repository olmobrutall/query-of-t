import * as ts from 'typescript';
import * as path from 'path';
import transformerFactory from 'quote-transformer';

// Header already includes ExParam so it won't be modified by the transformer,
// keeping it out of the expected strings for assertSimpleTransform.
const HEADER = `import { ExLambda, Quoted, ExParam } from "quote-transformer/quoted";
function test<T extends Function>(exp: Quoted<T>): T {
    return exp();
}
function asQuoted<T extends Function>(exp: Quoted<T>): Quoted<T> {
    return exp;
}
function withQuoted<T extends Function>(f: T, quoted?: () => ExLambda): T {
    return f;
}
`;

// Virtual query-of-t module: provides field and entity type declarations for test programs.
const VIRTUAL_QOT_PATH = path.join(process.cwd(), '__virtual_query_of_t__.ts');
const VIRTUAL_QOT_SOURCE = `
export interface FieldOptions {
    name?: string;
    nullable?: boolean;
    container?: () => unknown;
}
export declare function field(value: undefined, context: ClassFieldDecoratorContext): void;
export declare function field(type: () => unknown, options?: FieldOptions): (value: undefined, context: ClassFieldDecoratorContext) => void;
export declare function entity(...args: any[]): any;
`;

// Standard header for assertFieldTransform: imports field and entity from query-of-t.
const FIELD_HEADER = `import { entity, field } from "query-of-t";
class Lite<T> {}
`;

function transformSource(source: string): string {
    const fileName = path.join(process.cwd(), '__test__.ts');
    const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.ESNext, true);

    const defaultHost = ts.createCompilerHost({});
    const customHost: ts.CompilerHost = {
        ...defaultHost,
        getSourceFile: (name, languageVersion) => {
            if (path.normalize(name) === path.normalize(fileName))
                return sourceFile;
            return defaultHost.getSourceFile(name, languageVersion);
        },
        fileExists: (name) => path.normalize(name) === path.normalize(fileName) || defaultHost.fileExists(name),
        readFile: (name) => path.normalize(name) === path.normalize(fileName) ? source : defaultHost.readFile(name),
    };

    const program = ts.createProgram([fileName], {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.CommonJS,
        moduleResolution: ts.ModuleResolutionKind.Node10,
        experimentalDecorators: true,
        skipLibCheck: true,
        strict: false,
    }, customHost);

    const transformer = transformerFactory(program, undefined, {
        ts,
        addDiagnostic: () => 0,
    } as any);

    const result = ts.transform(sourceFile, [transformer]);
    return ts.createPrinter().printFile(result.transformed[0]);
}

// Like transformSource but resolves "query-of-t" to a virtual module providing field/entity declarations.
function transformSourceWithField(source: string): string {
    const fileName = path.join(process.cwd(), '__test__.ts');
    const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.ESNext, true);
    const qotFile = ts.createSourceFile(VIRTUAL_QOT_PATH, VIRTUAL_QOT_SOURCE, ts.ScriptTarget.ESNext, true);

    const defaultHost = ts.createCompilerHost({});
    const customHost: ts.CompilerHost = {
        ...defaultHost,
        getSourceFile: (name, languageVersion) => {
            const norm = path.normalize(name);
            if (norm === path.normalize(fileName)) return sourceFile;
            if (norm === path.normalize(VIRTUAL_QOT_PATH)) return qotFile;
            return defaultHost.getSourceFile(name, languageVersion);
        },
        fileExists: (name) => {
            const norm = path.normalize(name);
            return norm === path.normalize(fileName)
                || norm === path.normalize(VIRTUAL_QOT_PATH)
                || defaultHost.fileExists(name);
        },
        readFile: (name) => {
            const norm = path.normalize(name);
            if (norm === path.normalize(fileName)) return source;
            if (norm === path.normalize(VIRTUAL_QOT_PATH)) return VIRTUAL_QOT_SOURCE;
            return defaultHost.readFile(name);
        },
        // eslint-disable-next-line deprecation/deprecation
        resolveModuleNames(moduleNames, containingFile, _reused, _redirected, compilerOptions) {
            return moduleNames.map(name => {
                if (name === 'query-of-t')
                    return { resolvedFileName: VIRTUAL_QOT_PATH, isExternalLibraryImport: false };
                return ts.resolveModuleName(name, containingFile, compilerOptions, defaultHost).resolvedModule;
            });
        },
    };

    const program = ts.createProgram([fileName], {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.CommonJS,
        moduleResolution: ts.ModuleResolutionKind.Node10,
        experimentalDecorators: true,
        skipLibCheck: true,
        strict: false,
    }, customHost);

    const transformer = transformerFactory(program, undefined, {
        ts,
        addDiagnostic: () => 0,
    } as any);

    const result = ts.transform(sourceFile, [transformer]);
    return ts.createPrinter().printFile(result.transformed[0]);
}

function normalize(s: string): string {
    return s.replace(/\s+/g, ' ').trim();
}

let cachedPrintedHeader: string | null = null;
function getPrintedHeader(): string {
    if (cachedPrintedHeader === null)
        cachedPrintedHeader = transformSource(HEADER);
    return cachedPrintedHeader;
}

let cachedPrintedFieldHeader: string | null = null;
function getPrintedFieldHeader(): string {
    if (cachedPrintedFieldHeader === null)
        cachedPrintedFieldHeader = transformSourceWithField(FIELD_HEADER);
    return cachedPrintedFieldHeader;
}

function assertSimpleTransform(input: string, expected: string): void {
    const result = transformSource(HEADER + input);
    const headerNorm = normalize(getPrintedHeader());
    const resultNorm = normalize(result);
    expect(resultNorm.startsWith(headerNorm)).toBe(true);
    const body = resultNorm.slice(headerNorm.length).trim();
    expect(body).toBe(normalize(expected));
}

function assertFullTransform(input: string, expected: string): void {
    expect(normalize(transformSource(input))).toBe(normalize(expected));
}

// Asserts a transformation where field and entity are imported from "query-of-t".
// The test body comes after the standard FIELD_HEADER (which imports field, entity, and Lite<T>).
function assertFieldTransform(input: string, expected: string): void {
    const result = transformSourceWithField(FIELD_HEADER + input);
    const headerNorm = normalize(getPrintedFieldHeader());
    const resultNorm = normalize(result);
    expect(resultNorm.startsWith(headerNorm)).toBe(true);
    const body = resultNorm.slice(headerNorm.length).trim();
    expect(body).toBe(normalize(expected));
}

// Like assertFullTransform but resolves query-of-t (for import-injection tests).
function assertFullFieldTransform(input: string, expected: string): void {
    expect(normalize(transformSourceWithField(input))).toBe(normalize(expected));
}

describe('quote-transformer', () => {

    test('simple addition', () => {
        assertSimpleTransform(
            `test((a: number) => a + 1);`,
            `test(Object.assign((a: number) => a + 1, {
    __quoted: (): ExLambda => ((a: ExParam) => ["=>", [a], ["+", a, ["c", 1]]])(["p", "a"])
}));`
        );
    });

    test('property access chain', () => {
        assertSimpleTransform(
            `test((a: { name: string }) => a.name.length);`,
            `test(Object.assign((a: {
    name: string;
}) => a.name.length, {
    __quoted: (): ExLambda => ((a: ExParam) => ["=>", [a], [".", [".", a, "name"], "length"]])(["p", "a"])
}));`
        );
    });

    test('unary minus and equality', () => {
        assertSimpleTransform(
            `test((a: number) => a - (-a) == 0);`,
            `test(Object.assign((a: number) => a - (-a) == 0, {
    __quoted: (): ExLambda => ((a: ExParam) => ["=>", [a], ["==", ["-", a, ["-u", a]], ["c", 0]]])(["p", "a"])
}));`
        );
    });

    test('curried lambda', () => {
        assertSimpleTransform(
            `test((a: number) => (b: number) => a + b);`,
            `test(Object.assign((a: number) => (b: number) => a + b, {
    __quoted: (): ExLambda => ((a: ExParam) => ["=>", [a], ((b: ExParam) => ["=>", [b], ["+", a, b]])(["p", "b"])])(["p", "a"])
}));`
        );
    });

    test('array literal', () => {
        assertSimpleTransform(
            `test((a: number) => [a, a]);`,
            `test(Object.assign((a: number) => [a, a], {
    __quoted: (): ExLambda => ((a: ExParam) => ["=>", [a], ["[]", [a, a]]])(["p", "a"])
}));`
        );
    });

    test('object literal', () => {
        assertSimpleTransform(
            `test((a: number) => ({ a, b: a }));`,
            `test(Object.assign((a: number) => ({ a, b: a }), {
    __quoted: (): ExLambda => ((a: ExParam) => ["=>", [a], ["{}", {
                a: a,
                b: a
            }]])(["p", "a"])
}));`
        );
    });

    test('ternary', () => {
        assertSimpleTransform(
            `test((a: number) => a > 0 ? a : -a);`,
            `test(Object.assign((a: number) => a > 0 ? a : -a, {
    __quoted: (): ExLambda => ((a: ExParam) => ["=>", [a], ["?:", [">", a, ["c", 0]], a, ["-u", a]]])(["p", "a"])
}));`
        );
    });

    test('post-increment is not transformed', () => {
        assertSimpleTransform(
            `test((a: number) => a++);`,
            `test((a: number) => a++);`
        );
    });

    test('nested call', () => {
        assertSimpleTransform(
            `test((a: number) => test((b: number) => a + b));`,
            `test(Object.assign((a: number) => test((b: number) => a + b), {
    __quoted: (): ExLambda => ((a: ExParam) => ["=>", [a], ["()", ["c", test], [((b: ExParam) => ["=>", [b], ["+", a, b]])(["p", "b"])]]])(["p", "a"])
}));`
        );
    });

    test('nested Quoted call does not inject Object.assign into outer quote body', () => {
        assertSimpleTransform(
            `test((a: number) => asQuoted((b: number) => b == a));`,
            `test(Object.assign((a: number) => asQuoted((b: number) => b == a), {
    __quoted: (): ExLambda => ((a: ExParam) => ["=>", [a], ["()", ["c", asQuoted], [((b: ExParam) => ["=>", [b], ["==", b, a]])(["p", "b"])]]])(["p", "a"])
}));`
        );
    });

    test('variable declaration with Quoted type', () => {
        assertSimpleTransform(
            `var nonEmpty: Quoted<(a: string) => boolean> = (a: string) => a.length > 0;`,
            `var nonEmpty: Quoted<(a: string) => boolean> = Object.assign((a: string) => a.length > 0, {
    __quoted: (): ExLambda => ((a: ExParam) => ["=>", [a], [">", [".", a, "length"], ["c", 0]]])(["p", "a"])
});`
        );
    });

    test('reassignment to Quoted-typed variable', () => {
        assertSimpleTransform(
            `var nonEmpty: Quoted<(a: string) => boolean>;
nonEmpty = (a: string) => a.length > 0 && a != "";`,
            `var nonEmpty: Quoted<(a: string) => boolean>;
nonEmpty = Object.assign((a: string) => a.length > 0 && a != "", {
    __quoted: (): ExLambda => ((a: ExParam) => ["=>", [a], ["&&", [">", [".", a, "length"], ["c", 0]], ["!=", a, ["c", ""]]]])(["p", "a"])
});`
        );
    });

    test('field decorator infers runtime type', () => {
        assertFieldTransform(
            `class Person {
    @field isActive!: boolean;
    @field dateOfBirth!: Date;
    @field dateOfDeath!: Date | null;
    @field bestFriend!: Lite<Person> | null;
    @field otherFriends!: Person[];
}`,
            `class Person {
    @field(() => Boolean) isActive!: boolean;
    @field(() => Date) dateOfBirth!: Date;
    @field(() => Date, { nullable: true }) dateOfDeath!: Date | null;
    @field(() => Person, { nullable: true, container: () => Lite }) bestFriend!: Lite<Person> | null;
    @field(() => Person, { container: () => Array }) otherFriends!: Person[];
}`
        );
    });

    test('auto-injects @field for @entity classes', () => {
        assertFieldTransform(
            `function ignore(_value: undefined, _context: ClassFieldDecoratorContext): void { }
@entity
class PersonEntity {
    name!: string;
    age!: number;
    static count: number;
    @ignore hidden!: string;
}`,
            `function ignore(_value: undefined, _context: ClassFieldDecoratorContext): void { }
@entity
class PersonEntity {
    @field(() => String) name!: string;
    @field(() => Number) age!: number;
    static count: number;
    @ignore hidden!: string;
}`
        );
    });

    test('auto-injects @field with two args for generic types in @entity classes', () => {
        assertFieldTransform(
            `@entity
class EmployeeEntity {
    name!: string;
    manager!: Lite<EmployeeEntity> | null;
    reports!: EmployeeEntity[];
}`,
            `@entity
class EmployeeEntity {
    @field(() => String) name!: string;
    @field(() => EmployeeEntity, { nullable: true, container: () => Lite }) manager!: Lite<EmployeeEntity> | null;
    @field(() => EmployeeEntity, { container: () => Array }) reports!: EmployeeEntity[];
}`
        );
    });

    test('field decorator resolves primitive type aliases to options bag', () => {
        assertFieldTransform(
            `type int = number;
class Order {
    @field quantity!: int;
    @field price!: number;
}`,
            `type int = number;
class Order {
    @field(() => Number, { name: "int" }) quantity!: int;
    @field(() => Number) price!: number;
}`
        );
    });

    test('field decorator handles nullable element in container', () => {
        assertFieldTransform(
            `type int = number;
class Order {
    @field nums!: (int | null)[];
    @field tags!: string[];
}`,
            `type int = number;
class Order {
    @field(() => Number, { name: "int", nullable: true, container: () => Array }) nums!: (int | null)[];
    @field(() => String, { container: () => Array }) tags!: string[];
}`
        );
    });

    test('field decorator handles enum types', () => {
        assertFieldTransform(
            `enum Color { Red, Green, Blue }
class Item {
    @field color!: Color;
    @field name!: string;
}`,
            `enum Color { Red, Green, Blue }
class Item {
    @field(() => Color, { name: "Color" }) color!: Color;
    @field(() => String) name!: string;
}`
        );
    });

    test('field decorator handles field-level nullable', () => {
        assertFieldTransform(
            `class Order {
    @field amount!: number | null;
    @field middleName!: string | null;
    @field nums!: number[] | null;
}`,
            `class Order {
    @field(() => Number, { nullable: true }) amount!: number | null;
    @field(() => String, { nullable: true }) middleName!: string | null;
    @field(() => Number, { container: () => Array }) nums!: number[] | null;
}`
        );
    });

    test('@field(false) suppresses auto-inject', () => {
        assertFieldTransform(
            `@entity
class Order {
    @field(false) name!: string;
    amount!: number;
}`,
            `@entity
class Order {
    @field(false) name!: string;
    @field(() => Number) amount!: number;
}`
        );
    });

    test('auto-inject adds field to existing query-of-t import', () => {
        assertFullFieldTransform(
            `import { entity } from "query-of-t";
@entity
class Person {
    name!: string;
}`,
            `import { entity, field } from "query-of-t";
@entity
class Person {
    @field(() => String) name!: string;
}`
        );
    });

    test('quoted method decorator generates ExLambda arg', () => {
        assertSimpleTransform(
            `export function quoted(exp?: () => ExLambda) {
    return function (value: any, context: ClassMethodDecoratorContext) { return value; };
}
class Person {
    dateOfBirth!: Date;
    @quoted()
    isOld(): boolean {
        return this.dateOfBirth.getFullYear() < 1950;
    }
    @quoted()
    static isMillenialYear(y: number): boolean {
        return 1981 <= y && y <= 1996;
    }
}`,
            `export function quoted(exp?: () => ExLambda) {
    return function (value: any, context: ClassMethodDecoratorContext) { return value; };
}
class Person {
    dateOfBirth!: Date;
    @quoted((): ExLambda => ((_this: ExParam) => ["=>", [_this], ["<", ["()", [".", [".", _this, "dateOfBirth"], "getFullYear"], []], ["c", 1950]]])(["p", "_this"]))
    isOld(): boolean {
        return this.dateOfBirth.getFullYear() < 1950;
    }
    @quoted((): ExLambda => ((y: ExParam) => ["=>", [y], ["&&", ["<=", ["c", 1981], y], ["<=", y, ["c", 1996]]]])(["p", "y"]))
    static isMillenialYear(y: number): boolean {
        return 1981 <= y && y <= 1996;
    }
}`
        );
    });

    test('withQuoted adds quoted arg for function expression', () => {
        assertSimpleTransform(
            `interface Person { dateOfBirth: Date; }
Person.prototype.isMillenial = withQuoted(function (this: Person) {
    return 1981 <= this.dateOfBirth.getFullYear() && this.dateOfBirth.getFullYear() <= 1996;
});`,
            `interface Person { dateOfBirth: Date; }
Person.prototype.isMillenial = withQuoted(function (this: Person) {
    return 1981 <= this.dateOfBirth.getFullYear() && this.dateOfBirth.getFullYear() <= 1996;
}, (): ExLambda => ((_this: ExParam) => ["=>", [_this], ["&&", ["<=", ["c", 1981], ["()", [".", [".", _this, "dateOfBirth"], "getFullYear"], []]], ["<=", ["()", [".", [".", _this, "dateOfBirth"], "getFullYear"], []], ["c", 1996]]]])(["p", "_this"]));`
        );
    });

    test('adds ExParam to import when not present', () => {
        assertFullTransform(
            `import { ExLambda, Quoted } from "quote-transformer/quoted";
function test<T extends Function>(exp: Quoted<T>): T { return exp(); }
test((a: number) => a + 1);`,
            `import { ExLambda, Quoted, ExParam } from "quote-transformer/quoted";
function test<T extends Function>(exp: Quoted<T>): T { return exp(); }
test(Object.assign((a: number) => a + 1, {
    __quoted: (): ExLambda => ((a: ExParam) => ["=>", [a], ["+", a, ["c", 1]]])(["p", "a"])
}));`
        );
    });

});

describe('msg() localization transform', () => {
    const MSG_DECL = `function msg(desc?: string, member?: string, module?: string): any { return null; }\n`;

    test('msg() injects member and module from const object at module scope', () => {
        assertSimpleTransform(
            MSG_DECL +
            `const ValidationMessage = {
    _0IsNotSet: msg(),
    BeNotNull: msg(),
};`,
            MSG_DECL +
            `const ValidationMessage = {
    _0IsNotSet: msg(undefined, "_0IsNotSet", "ValidationMessage"),
    BeNotNull: msg(undefined, "BeNotNull", "ValidationMessage"),
};`
        );
    });

    test('msg(desc) preserves explicit desc and still injects member and module', () => {
        assertSimpleTransform(
            MSG_DECL +
            `const ValidationMessage = {
    _0HasMoreThan1DecimalPlaces: msg("{0} has more than {1} decimal places"),
};`,
            MSG_DECL +
            `const ValidationMessage = {
    _0HasMoreThan1DecimalPlaces: msg("{0} has more than {1} decimal places", "_0HasMoreThan1DecimalPlaces", "ValidationMessage"),
};`
        );
    });

    test('msg() inside a function is not transformed', () => {
        assertSimpleTransform(
            MSG_DECL +
            `function setup() {
    const ValidationMessage = { _0IsNotSet: msg() };
}`,
            MSG_DECL +
            `function setup() {
    const ValidationMessage = { _0IsNotSet: msg() };
}`
        );
    });

    test('msg() in a let binding is not transformed', () => {
        assertSimpleTransform(
            MSG_DECL +
            `let ValidationMessage = { _0IsNotSet: msg() };`,
            MSG_DECL +
            `let ValidationMessage = { _0IsNotSet: msg() };`
        );
    });

    test('non-msg calls inside const object are not transformed', () => {
        assertSimpleTransform(
            MSG_DECL +
            `const ValidationMessage = { _0IsNotSet: other() };`,
            MSG_DECL +
            `const ValidationMessage = { _0IsNotSet: other() };`
        );
    });
});
