import { ExLambda, Quoted } from "quote-transformer/lib/quoted";

function test<T extends Function>(exp: Quoted<T>): void {

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





function quoted(exp?: () => ExLambda) {
    return function (target: any, key: string) {

        if (exp == undefined)
            throw new Error(`Unable to add the quoted expression to "${target.name}". Are you using ts-path and quote-transformer?`);

        //Reflect.defineMetadata('quoted', exp, target);
    };
}


class Person {

    dateOfBirth: Date;

    @quoted()
    isMillenial = () => 1981 <= this.dateOfBirth.getFullYear() && this.dateOfBirth.getFullYear() <= 1996;

}