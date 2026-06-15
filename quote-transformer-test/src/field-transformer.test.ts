import { transformSource, normalize } from './transform-utils';

// Declares field and entity without imports — the transformer identifies decorators
// by name, so no module resolution is needed for @field/@entity to work.
const FIELD_HEADER = `
declare function field(value: undefined, context: ClassFieldDecoratorContext): void;
declare function field(type: () => unknown, options?: { name?: string; nullable?: boolean; container?: () => unknown; }): (value: undefined, context: ClassFieldDecoratorContext) => void;
declare function entity(...args: any[]): any;
class Lite<T> {}
`;

let cachedPrintedFieldHeader: string | null = null;
function getPrintedFieldHeader(): string {
    if (cachedPrintedFieldHeader === null)
        cachedPrintedFieldHeader = transformSource(FIELD_HEADER);
    return cachedPrintedFieldHeader;
}

// Asserts a field-related transformation. The FIELD_HEADER (field/entity declarations + Lite<T>)
// is prepended automatically so test bodies don't need to redeclare those.
function assertFieldTransform(input: string, expected: string): void {
    const result = transformSource(FIELD_HEADER + input);
    const headerNorm = normalize(getPrintedFieldHeader());
    const resultNorm = normalize(result);
    expect(resultNorm.startsWith(headerNorm)).toBe(true);
    const body = resultNorm.slice(headerNorm.length).trim();
    expect(body).toBe(normalize(expected));
}

describe('field-transformer', () => {

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

    // Tests that auto-inject appends 'field' to whichever import already has 'entity',
    // regardless of the module path.
    test('auto-inject adds field to the import that contains entity', () => {
        expect(normalize(transformSource(
            `import { entity } from "./decorators";
@entity
class Person {
    name!: string;
}`
        ))).toBe(normalize(
            `import { entity, field } from "./decorators";
@entity
class Person {
    @field(() => String) name!: string;
}`
        ));
    });

});
