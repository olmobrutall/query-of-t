import { ExLambda, Quoted, ExParam } from "quote-transformer/quoted";
function test<T extends Function>(exp: Quoted<T>): T {
    return exp();
}
test(Object.assign((a: number) => a + 1, {
    __quoted: (): ExLambda => ((a: ExParam) => ["=>", [a], ["+", a, ["c", 1]]])(["p", "a"])
}));
test(Object.assign((a: {
    name: string;
}) => a.name.length, {
    __quoted: (): ExLambda => ((a: ExParam) => ["=>", [a], [".", [".", a, "name"], "length"]])(["p", "a"])
}));
test(Object.assign((a: number) => a - (-a) == 0, {
    __quoted: (): ExLambda => ((a: ExParam) => ["=>", [a], ["==", ["-", a, ["-u", a]], ["c", 0]]])(["p", "a"])
}));
test(Object.assign((a: number) => (b: number) => a + b, {
    __quoted: (): ExLambda => ((a: ExParam) => ["=>", [a], ((b: ExParam) => ["=>", [b], ["+", a, b]])(["p", "b"])])(["p", "a"])
}));
test(Object.assign((a: number) => a + 1, {
    __quoted: (): ExLambda => ((a: ExParam) => ["=>", [a], ["+", a, ["c", 1]]])(["p", "a"])
}));
test(Object.assign((a: number) => [a, a], {
    __quoted: (): ExLambda => ((a: ExParam) => ["=>", [a], ["[]", [a, a]]])(["p", "a"])
}));
test(Object.assign((a: number) => ({ a, b: a }), {
    __quoted: (): ExLambda => ((a: ExParam) => ["=>", [a], ["{}", {
                a: a,
                b: a
            }]])(["p", "a"])
}));
test(Object.assign((a: number) => a > 0 ? a : -a, {
    __quoted: (): ExLambda => ((a: ExParam) => ["=>", [a], ["?:", [">", a, ["c", 0]], a, ["-u", a]]])(["p", "a"])
}));
test((a: number) => a++);
//Nested test
test(Object.assign((a: number) => test((b: number) => a + b), {
    __quoted: (): ExLambda => ((a: ExParam) => ["=>", [a], ["()", ["c", test], [((b: ExParam) => ["=>", [b], ["+", a, b]])(["p", "b"])]]])(["p", "a"])
}));
function asQuoted<T extends Function>(exp: Quoted<T>): Quoted<T> {
    return exp;
}
// Repro: nested Quoted call inside another Quoted lambda should not inject Object.assign into outer quote body.
test(Object.assign((a: number) => asQuoted((b: number) => b == a), {
    __quoted: (): ExLambda => ((a: ExParam) => ["=>", [a], ["()", ["c", asQuoted], [((b: ExParam) => ["=>", [b], ["==", b, a]])(["p", "b"])]]])(["p", "a"])
}));
function withQuoted<T extends Function>(f: T, quoted?: () => ExLambda /*Compiler Generated*/): T {
    (f as T & {
        __quoted?: () => ExLambda;
    }).__quoted = quoted;
    return f;
}
function field(value: undefined, context: ClassFieldDecoratorContext): void;
function field(type: () => Function, innerType?: () => Function): (value: undefined, context: ClassFieldDecoratorContext) => void;
function field(...args: any[]) {
    if (args.length >= 2 && typeof args[1] == "object")
        throw new Error(`@field should be replaced by compiler to @field(() => Type)`);
    if (args.length == 0 || typeof args[0] != "function")
        throw new Error(`Invalid @field usage`);
    return function (..._decoratorArgs: any[]) { };
}
export function quoted(exp?: () => ExLambda) {
    return function (value: any, context: ClassMethodDecoratorContext) {
        return value;
    };
}
class Lite<T> {
}
class Person {
    @field(() => Boolean)
    isActive!: boolean;
    @field(() => Date)
    dateOfBirth!: Date;
    @field(() => Date, { nullable: true })
    dateOfDeath!: Date | null;
    @field(() => Person, { nullable: true, container: () => Lite })
    bestFriend!: Lite<Person> | null;
    @field(() => Person, { container: () => Array })
    otherFriends!: Person[];
    @quoted((): ExLambda => ((_this: ExParam) => ["=>", [_this], ["<", ["()", [".", [".", _this, "dateOfBirth"], "getFullYear"], []], ["c", 1950]]])(["p", "_this"]))
    isOld(): boolean {
        return this.dateOfBirth.getFullYear() < 1950;
    }
    @quoted((): ExLambda => ((_this: ExParam, ol: ExParam) => ["=>", [_this, ol], ["()", ["()", ["c", asQuoted], [((x: ExParam) => ["=>", [x], ["==", [".", x, "year"], ["()", [".", [".", _this, "dateOfBirth"], "getFullYear"], []]]])(["p", "x"])]], [ol]]])(["p", "_this"], ["p", "ol"]))
    hasSameBirthYearAs(ol: {
        year: number;
    }): boolean {
        return asQuoted((x: {
            year: number;
        }) => x.year == this.dateOfBirth.getFullYear())(ol);
    }
    @quoted((): ExLambda => ((y: ExParam) => ["=>", [y], ["&&", ["<=", ["c", 1981], y], ["<=", y, ["c", 1996]]]])(["p", "y"]))
    static isMillenialYear(y: number): boolean {
        return 1981 <= y && y <= 1996;
    }
}
interface Person {
    isMillenial: () => boolean;
}
Person.prototype.isMillenial = withQuoted(function (this: Person) {
    return 1981 <= this.dateOfBirth.getFullYear() && this.dateOfBirth.getFullYear() <= 1996;
}, (): ExLambda => ((_this: ExParam) => ["=>", [_this], ["&&", ["<=", ["c", 1981], ["()", [".", [".", _this, "dateOfBirth"], "getFullYear"], []]], ["<=", ["()", [".", [".", _this, "dateOfBirth"], "getFullYear"], []], ["c", 1996]]]])(["p", "_this"]));
var nonEmpty: Quoted<(a: string) => boolean> = Object.assign((a: string) => a.length > 0, {
    __quoted: (): ExLambda => ((a: ExParam) => ["=>", [a], [">", [".", a, "length"], ["c", 0]]])(["p", "a"])
});
nonEmpty = Object.assign((a: string) => a.length > 0 && a != "", {
    __quoted: (): ExLambda => ((a: ExParam) => ["=>", [a], ["&&", [">", [".", a, "length"], ["c", 0]], ["!=", a, ["c", ""]]]])(["p", "a"])
});
var p = new Person();
console.log(p.isMillenial());
// --- msg() localization ---
function msg(desc?: string, member?: string, module?: string): any { return null; }
const ValidationMessage = {
    _0IsNotSet: msg(undefined, "_0IsNotSet", "ValidationMessage"),
    BeNotNull: msg(undefined, "BeNotNull", "ValidationMessage"),
    _0HasMoreThan1DecimalPlaces: msg("{0} has more than {1} decimal places", "_0HasMoreThan1DecimalPlaces", "ValidationMessage"),
};
