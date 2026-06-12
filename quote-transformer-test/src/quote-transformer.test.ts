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

function normalize(s: string): string {
    return s.replace(/\s+/g, ' ').trim();
}

let cachedPrintedHeader: string | null = null;
function getPrintedHeader(): string {
    if (cachedPrintedHeader === null)
        cachedPrintedHeader = transformSource(HEADER);
    return cachedPrintedHeader;
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
        assertSimpleTransform(
            `function field(value: undefined, context: ClassFieldDecoratorContext): void;
function field(type: () => unknown, options?: { name?: string; nullable?: boolean; container?: () => unknown; }): (value: undefined, context: ClassFieldDecoratorContext) => void;
function field(..._args: any[]) { return function () { }; }
class Lite<T> { }
class Person {
    @field isActive!: boolean;
    @field dateOfBirth!: Date;
    @field dateOfDeath!: Date | null;
    @field bestFriend!: Lite<Person> | null;
    @field otherFriends!: Person[];
}`,
            `function field(value: undefined, context: ClassFieldDecoratorContext): void;
function field(type: () => unknown, options?: { name?: string; nullable?: boolean; container?: () => unknown; }): (value: undefined, context: ClassFieldDecoratorContext) => void;
function field(..._args: any[]) { return function () { }; }
class Lite<T> { }
class Person {
    @field(() => Boolean) isActive!: boolean;
    @field(() => Date) dateOfBirth!: Date;
    @field(() => Date) dateOfDeath!: Date | null;
    @field(() => Person, { container: () => Lite }) bestFriend!: Lite<Person> | null;
    @field(() => Person, { container: () => Array }) otherFriends!: Person[];
}`
        );
    });

    test('auto-injects @field for ModifiableEntity subclasses', () => {
        assertSimpleTransform(
            `function field(type: () => Function, innerType?: () => Function): (value: undefined, context: ClassFieldDecoratorContext) => void;
function field(..._args: any[]) { return function () { }; }
function ignore(_value: undefined, _context: ClassFieldDecoratorContext): void { }
class Lite<T> { }
abstract class ModifiableEntity { }
class PersonEntity extends ModifiableEntity {
    name!: string;
    age!: number;
    static count: number;
    @ignore hidden!: string;
}`,
            `function field(type: () => Function, innerType?: () => Function): (value: undefined, context: ClassFieldDecoratorContext) => void;
function field(..._args: any[]) { return function () { }; }
function ignore(_value: undefined, _context: ClassFieldDecoratorContext): void { }
class Lite<T> { }
abstract class ModifiableEntity { }
class PersonEntity extends ModifiableEntity {
    @field(() => String) name!: string;
    @field(() => Number) age!: number;
    static count: number;
    @ignore hidden!: string;
}`
        );
    });

    test('auto-injects @field with two args for generic types in ModifiableEntity subclasses', () => {
        assertSimpleTransform(
            `function field(type: () => unknown, options?: { name?: string; nullable?: boolean; container?: () => unknown; }): (value: undefined, context: ClassFieldDecoratorContext) => void;
function field(..._args: any[]) { return function () { }; }
class Lite<T> { }
abstract class ModifiableEntity { }
class EmployeeEntity extends ModifiableEntity {
    name!: string;
    manager!: Lite<EmployeeEntity> | null;
    reports!: EmployeeEntity[];
}`,
            `function field(type: () => unknown, options?: { name?: string; nullable?: boolean; container?: () => unknown; }): (value: undefined, context: ClassFieldDecoratorContext) => void;
function field(..._args: any[]) { return function () { }; }
class Lite<T> { }
abstract class ModifiableEntity { }
class EmployeeEntity extends ModifiableEntity {
    @field(() => String) name!: string;
    @field(() => EmployeeEntity, { container: () => Lite }) manager!: Lite<EmployeeEntity> | null;
    @field(() => EmployeeEntity, { container: () => Array }) reports!: EmployeeEntity[];
}`
        );
    });

    test('field decorator resolves primitive type aliases to options bag', () => {
        assertSimpleTransform(
            `type int = number;
function field(value: undefined, context: ClassFieldDecoratorContext): void;
function field(type: () => unknown, options?: { name?: string; nullable?: boolean; container?: () => unknown; }): (value: undefined, context: ClassFieldDecoratorContext) => void;
function field(..._args: any[]) { return function () { }; }
class Order {
    @field quantity!: int;
    @field price!: number;
}`,
            `type int = number;
function field(value: undefined, context: ClassFieldDecoratorContext): void;
function field(type: () => unknown, options?: { name?: string; nullable?: boolean; container?: () => unknown; }): (value: undefined, context: ClassFieldDecoratorContext) => void;
function field(..._args: any[]) { return function () { }; }
class Order {
    @field(() => Number, { name: "int" }) quantity!: int;
    @field(() => Number) price!: number;
}`
        );
    });

    test('field decorator handles nullable element in container', () => {
        assertSimpleTransform(
            `type int = number;
function field(value: undefined, context: ClassFieldDecoratorContext): void;
function field(type: () => unknown, options?: { name?: string; nullable?: boolean; container?: () => unknown; }): (value: undefined, context: ClassFieldDecoratorContext) => void;
function field(..._args: any[]) { return function () { }; }
class Order {
    @field nums!: (int | null)[];
    @field tags!: string[];
}`,
            `type int = number;
function field(value: undefined, context: ClassFieldDecoratorContext): void;
function field(type: () => unknown, options?: { name?: string; nullable?: boolean; container?: () => unknown; }): (value: undefined, context: ClassFieldDecoratorContext) => void;
function field(..._args: any[]) { return function () { }; }
class Order {
    @field(() => Number, { name: "int", nullable: true, container: () => Array }) nums!: (int | null)[];
    @field(() => String, { container: () => Array }) tags!: string[];
}`
        );
    });

    test('field decorator handles enum types', () => {
        assertSimpleTransform(
            `enum Color { Red, Green, Blue }
function field(value: undefined, context: ClassFieldDecoratorContext): void;
function field(type: () => unknown, options?: { name?: string; }): (value: undefined, context: ClassFieldDecoratorContext) => void;
function field(..._args: any[]) { return function () { }; }
class Item {
    @field color!: Color;
    @field name!: string;
}`,
            `enum Color { Red, Green, Blue }
function field(value: undefined, context: ClassFieldDecoratorContext): void;
function field(type: () => unknown, options?: { name?: string; }): (value: undefined, context: ClassFieldDecoratorContext) => void;
function field(..._args: any[]) { return function () { }; }
class Item {
    @field(() => Color, { name: "Color" }) color!: Color;
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
