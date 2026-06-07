import { ExLambda, Quoted } from "quote-transformer/quoted";

function test<T extends Function>(exp: Quoted<T>): T {
    return exp();
}

test((a: number) => a + 1);
test((a: { name: string }) => a.name.length);
test((a: number) => a - (-a) == 0);
test((a: number) => (b: number) => a + b);
test((a: number) => a + 1);
test((a: number) => [a, a]);
test((a: number) => ({ a, b: a }));
test((a: number) => a > 0 ? a : -a);
test((a: number) => a++);

//Nested test
test((a: number) => test((b: number) => a + b));

function asQuoted<T extends Function>(exp: Quoted<T>): Quoted<T> {
    return exp;
}

// Repro: nested Quoted call inside another Quoted lambda should not inject Object.assign into outer quote body.
test((a: number) => asQuoted((b: number) => b == a));


function withQuoted<T extends Function>(f: T, quoted?: () => ExLambda /*Compiler Generated*/): T {
    (f as T & { __quoted?: () => ExLambda }).__quoted = quoted;
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

    @field
    isActive!: boolean;

    @field
    dateOfBirth!: Date;

    @field
    dateOfDeath!: Date | null;

    @field
    bestFriend!: Lite<Person> | null;

    @field
    otherFriends!: Person[];

    @quoted()
    isOld(): boolean {
        return this.dateOfBirth.getFullYear() < 1950;
    }

    @quoted()
    hasSameBirthYearAs(ol: { year: number }): boolean {
        return asQuoted((x: { year: number }) => x.year == this.dateOfBirth.getFullYear())(ol);
    }

    @quoted()
    static isMillenialYear(y: number): boolean {
        return 1981 <= y && y <= 1996;
    }
}

interface Person {
    isMillenial: () => boolean;
}

Person.prototype.isMillenial = withQuoted(function (this: Person) {
    return 1981 <= this.dateOfBirth.getFullYear() && this.dateOfBirth.getFullYear() <= 1996;
});

var nonEmpty: Quoted<(a: string) => boolean> = (a: string) => a.length > 0;

nonEmpty = (a: string) => a.length > 0 && a != "";

var p = new Person();
console.log(p.isMillenial());

// --- msg() localization ---

function msg(desc?: string, member?: string, module?: string): any { return null; }

const ValidationMessage = {
    _0IsNotSet: msg(),
    BeNotNull: msg(),
    _0HasMoreThan1DecimalPlaces: msg("{0} has more than {1} decimal places"),
};
