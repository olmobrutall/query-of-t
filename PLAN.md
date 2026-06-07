# query-of-t Implementation Plan

TypeScript LINQ provider / ORM inspired by Signum Framework.
Reference implementation: `southwind/` submodule (do not modify).
Reference implementation: `southwind/Framework` submodule (do not modify).

---

## Architecture decisions

| Decision | Choice |
|---|---|
| Folder layout per module | `Module/all/`, `Module/back/`, `Module/client/` |
| `strictPropertyInitialization` | `false` (already set) |
| `@field` on entity fields | Compiler auto-generated for `ModifiableEntity` subclasses; two-arg for generic wrappers |
| `@field` two-arg signature | `@field(() => Lite, () => EmployeeEntity)` for `Lite<T>`, `Array<T>`, `LiteWithPhoto<T>` etc. |
| `Lite<T>` | `abstract class Lite<out T>` with abstract `toString()`; concrete `LiteImp<T>` has `toStr: string`; no separate LiteModel class |
| Array fields in entities | Only `Entity[]` with back FK (virtual MList). Single embedded allowed; arrays of embedded are not |
| Many-to-many | Explicit junction entity (e.g. `EmployeeTerritoryEntity extends Entity`) |
| FK dual properties | `employee: Lite<Employee>` → implicit column `employeeId` by convention; explicit `employeeId: number` property linked by naming convention (`fieldName + "Id"`) or `@fkProperty('name')` override |
| Validator decorator names | `Validator` suffix: `@stringLengthValidator`, `@telephoneValidator`, `@urlValidator` etc. |
| `toString` | Regular `@quoted()` method on the entity class — not a separate decorator |
| Entity initialisation | `.init(values: InitValues<this>): this` on `ModifiableEntity` — inherited via polymorphic `this`; constructor approach cannot be inherited type-safely in TypeScript |
| Change detection | Snapshot saved on entity after load/save; stores primitives + FK ids only (no deep references) |
| Cross-module expressions | `withQuoted` + `declare module` augmentation in the `all/` file of the entity being extended |
| Logic namespaces | `export namespace EmployeesLogic { ... }` mirrors C# `static class` |
| Mixins | `@mixin(TargetEntity)` class decorator OR `MixinDeclarations.register(Target, Mixin)`; fields merged into target `TypeInfo`; `.mixin<M>()` on `ModifiableEntity` is just a cast |
| `@implementedBy` / `@implementedByAll` | Identical semantics to Signum C# |
| Bulk operations | `executeDelete()`, `executeUpdate(Quoted<(e:T)=>Partial<T>>)`, `executeInsert()` on `Query<T>` |
| `deleteEntity` | Implemented via `executeDelete()` on a filtered query |

---

## File/folder conventions

```
query-of-t/src/
  entities/
    modifiable.ts        ModifiableEntity base (init, mixin cast)
    entity.ts            Entity, EmbeddedEntity, ModelEntity
    lite.ts              Lite<out T> abstract, LiteImp<T>
    primaryKey.ts        PrimaryKey type alias
    graphExplorer.ts     Graph traversal, integrity check, Graphviz debug
    mixinDeclarations.ts @mixin decorator + MixinDeclarations.register
    snapshot.ts          takeSnapshot, diffSnapshot
  decorators.ts          @stringLengthValidator, @urlValidator, @telephoneValidator,
                         @emailValidator, @noRepeatValidator, @uniqueIndexValidator,
                         @ignore, @fkProperty, @implementedBy, @implementedByAll,
                         @entity, @allowUnauthenticated,
                         EntityKind enum, EntityData enum
  reflection.ts          @field, FieldInfo (+ innerType, isNullable), TypeInfo  ← extend existing
  schema/
    schema.ts            Schema singleton, tables map
    table.ts             Table<T>, Field hierarchy, IColumn
    schemaBuilder.ts     SchemaBuilder, EntityBuilder fluent chain
    connector.ts         Connector abstract class
    schemaGenerator.ts   Schema → DDL (CREATE TABLE, FK, indices)
    schemaSynchronizer.ts DB introspection → diff → SyncScript
  orm/
    save.ts              save(), insertRow(), updateRow()
    load.ts              load(), tryLoad()
    delete.ts            deleteEntity() → executeDelete()
  query/
    query.ts             ← extend existing Query<T> with flatMap, executeDelete/Update/Insert
    queryLogic.ts        QueryLogic.queries.register
  linq/
    dbExpressions.ts     DbExpression AST node types
    queryBinder.ts       Expression → DbExpression (main translator)
    optimisers.ts        UnusedColumnRemover, RedundantSubqueryRemover, ConditionsRewriter
    queryFormatter.ts    DbExpression → SQL string + parameters (SqlServer + Postgres)
    translatorBuilder.ts Compiles projector lambda; builds TranslateResult
    projectionReader.ts  Materialises DB rows → entity instances, sets _snapshot
  serialization/
    entitySerializer.ts  Entity ↔ JSON, LiteImp, Temporal dates
  client/
    queryTokenString.ts  QueryTokenString<T> with typed .nav() replacing .expression<S>()

quote-transformer/src/
  transformerFactory.ts  ← extend existing (auto-@field, two-arg generics, array handling)
```

---

## Entity model details

### ModifiableEntity

```typescript
type InitValues<T> = Partial<{
    [K in keyof T as T[K] extends Function ? never : K]: T[K]
}>;

abstract class ModifiableEntity {
    mixin<M>(mixinClass: new() => M): M          // cast only, no runtime logic
    init(values: InitValues<this>): this          // Object.assign; fully inherited via polymorphic this
}
```

### Entity

```typescript
abstract class Entity extends ModifiableEntity {
    id: PrimaryKey;
    isNew: boolean;
    ticks: number;
    _snapshot?: EntitySnapshot;                  // set after load/save; stores FK ids not Lite objects

    toLite(): Lite<this>
    isDirty(): boolean
}

abstract class EmbeddedEntity extends ModifiableEntity { }
abstract class ModelEntity   extends ModifiableEntity { }
```

### Lite\<T\>

```typescript
abstract class Lite<out T extends Entity> {      // 'out' = covariant (TS 4.7+)
    abstract readonly id: PrimaryKey
    abstract readonly entityType: new() => T
    abstract toString(): string

    is(other: Lite<Entity>): boolean
}

class LiteImp<T extends Entity> extends Lite<T> {
    constructor(
        readonly id: PrimaryKey,
        readonly entityType: new() => T,
        readonly toStr: string,                  // pre-computed string from DB
    ) {}
    toString(): string { return this.toStr; }
}
// Future: class LiteWithPhoto<T> extends Lite<T> { photoUrl: string; ... }
```

### FK dual properties

```typescript
// Implicit FK column (default — no TS property, column 'employeeId' in DB):
employee: Lite<EmployeeEntity>;

// Explicit FK property (linked by naming convention field + "Id"):
employee: Lite<EmployeeEntity>;
employeeId: number;

// Override convention:
@fkProperty('employeeRef')
employee: Lite<EmployeeEntity>;
employeeRef: number;
```

Snapshot stores `employeeId` (number), never the `Lite<T>` object.

### @implementedBy / @implementedByAll

```typescript
// Nullable FK per concrete type: columns idAnimal_Dog, idAnimal_Cat
@implementedBy(() => [DogEntity, CatEntity])
animal: Lite<AnimalEntity>;

// Type discriminator + generic id: columns tcs_target, id_target
@implementedByAll
target: Lite<Entity>;
```

### Mixin

```typescript
@mixin(UserEntity)                               // OR: MixinDeclarations.register(UserEntity, UserEmployeeMixin)
class UserEmployeeMixin {
    employee: Lite<EmployeeEntity> | null;       // auto-@field by transformer
}

// Access (pure cast):
user.mixin(UserEmployeeMixin).employee
(user as UserEntity & UserEmployeeMixin).employee
```

---

## Transformer v2 changes (quote-transformer)

Extend existing `transformerFactory.ts`:

**1. Two-arg `@field` for generic wrappers**

Current behaviour strips `Lite<T>` to just `T`. New behaviour:

| TS annotation | Emitted `@field` args |
|---|---|
| `string` | `() => String` |
| `number` | `() => Number` |
| `boolean` | `() => Boolean` |
| `Date` | `() => Date` |
| `AddressEmbedded` | `() => AddressEmbedded` |
| `Lite<EmployeeEntity>` | `() => Lite, () => EmployeeEntity` |
| `LiteWithPhoto<FileEntity>` | `() => LiteWithPhoto, () => FileEntity` |
| `EmployeeTerritoryEntity[]` | `() => Array, () => EmployeeTerritoryEntity` |

Generic rule: any one-type-arg generic class → two-arg form. Replace `extractMList` with `extractArray` handling `T[]` and `Array<T>`.

**2. Auto-inject `@field` for `ModifiableEntity` subclasses**

When a class declaration's heritage chain includes `ModifiableEntity` (resolved via type checker, not string match):
- For each `PropertyDeclaration` with no `@field` and no `@ignore`: synthesise and prepend `@field(...)`.
- Skip `static` fields.
- Fields with explicit `@field` or `@ignore` are left untouched.

**Updated `FieldInfo`:**

```typescript
interface FieldInfo {
    name: string;
    type: () => Function;
    innerType?: () => Function;   // for Lite<T>, Array<T>, LiteWithPhoto<T>
    isNullable: boolean;
    fkPropertyName?: string;      // explicit FK property name (from @fkProperty)
    validators: ValidatorInfo[];
    implementations?: ImplementationsInfo; // from @implementedBy / @implementedByAll
}
```

---

## Schema & Table classes

```typescript
class Schema {
    static current: Schema;
    readonly tables: Map<Function, Table<Entity>>;
    getTable<T extends Entity>(c: new() => T): Table<T>
    getDatabaseTables(): Table<Entity>[]
}

class Table<T extends Entity> {
    entityClass: new() => T
    tableName: ObjectName
    primaryKey: PrimaryKeyColumn
    columns: Map<string, Column>   // DB column name → Column
    fields: Map<string, Field>     // TS field name → Field
    indices: TableIndex[]
}

// Field hierarchy (mirrors Signum C# Schema.Basics.cs):
abstract class Field { }
class FieldValue         extends Field implements IColumn { }  // string, number, Date, boolean
class FieldPrimaryKey    extends Field implements IColumn { }
class FieldReference     extends Field implements IColumn { }  // Lite<T> → single FK column
class FieldImplementedBy extends Field { }                     // @implementedBy → N nullable FKs
class FieldImplementedByAll extends Field { }                  // @implementedByAll → type + id cols
class FieldEmbedded      extends Field { }                     // EmbeddedEntity → inline columns
class FieldMList         extends Field { }                     // Entity[] back-FK
```

`SchemaBuilder.include(EmployeeEntity)` walks `TypeInfo.fields` and builds the `Table<EmployeeEntity>` entry in `Schema.current`.

---

## GraphExplorer

Used by `save()` to traverse entity graphs, validate, and determine save order.

```typescript
namespace GraphExplorer {
    // Walk all ModifiableEntity instances reachable via FieldInfo (embedded + array fields).
    // Does NOT follow Lite<T> references.
    function fromRoot(root: ModifiableEntity): Set<ModifiableEntity>

    // Run all @*Validator decorators on every entity in the graph.
    // Returns null if valid; otherwise entity → field-name → error message.
    function fullIntegrityCheck(
        graph: Set<ModifiableEntity>
    ): Map<ModifiableEntity, Record<string, string>> | null

    // Dirty entities in dependency order (embedded before parent).
    function dirtyInSaveOrder(graph: Set<ModifiableEntity>): ModifiableEntity[]

    // Graphviz DOT string for debugging entity graphs.
    // Paste at https://dreampuf.github.io/GraphvizOnline/
    function toGraphviz(graph: Set<ModifiableEntity>): string
}
```

---

## Cross-module expressions

```typescript
// TerritoryEntity.all.ts — declares the navigation that EmployeesLogic.back.ts provides
declare module './RegionEntity' {
    interface RegionEntity {
        territories(): Query<TerritoryEntity>;
    }
}

// EmployeesLogic.back.ts — implementation (imports table(), server-side only)
RegionEntity.prototype.territories = withQuoted(function (this: RegionEntity) {
    return table(TerritoryEntity).filter(t => t.region.is(this.toLite()));
});

export namespace EmployeesLogic {
    export function start(sb: SchemaBuilder): void { ... }
    export function topEmployees(num: number): Promise<Lite<EmployeeEntity>[]> { ... }
}
```

`declare module` goes in the `all/` file of the entity being *extended* (here `TerritoryEntity.all.ts` augments `RegionEntity`). The prototype assignment stays in `back/` because it imports `table()`.

---

## QueryTokenString

Replaces untyped `.expression<S>("Name")` with typed `.nav()`:

```typescript
class QueryTokenString<T> {
    nav<S>(selector: Quoted<(v: NonNullable<T>) => S>): QueryTokenString<S>
    count(option?: "Distinct" | "Null" | "NotNull"): QueryTokenString<number>
    sum(): QueryTokenString<T>
    min(): QueryTokenString<T>
    max(): QueryTokenString<T>
    any(): QueryTokenString<ArrayElement<T>>
    all(): QueryTokenString<ArrayElement<T>>
    expression<S>(name: string): QueryTokenString<S>   // untyped escape hatch
}

// Before (Signum today):
CultureInfoEntity.token(a => a.entity).expression<boolean>("IsNeutral")

// After:
CultureInfoEntity.token(a => a.entity.isNeutral())
```

---

## Bulk operations on Query\<T\>

```typescript
// Translates to: DELETE FROM table WHERE <query conditions>
query.executeDelete(): Promise<number>

// Translates to: UPDATE table SET col=val WHERE <query conditions>
// Transformer captures Partial<T> object literal → SET pairs
query.executeUpdate(updater: Quoted<(e: T) => Partial<T>>): Promise<number>

// Translates to: INSERT INTO target (cols) SELECT ... FROM source
query.executeInsert<U extends Entity>(selector: Quoted<(e: T) => U>): Promise<number>

// deleteEntity delegates:
async function deleteEntity<T extends Entity>(entity: T): Promise<void> {
    const id = entity.id;
    await table(entity.constructor as new() => T)
        .filter(e => e.id == id)
        .executeDelete();
}
```

---

## SQL translator pipeline

Mirrors Signum C# `Engine/Linq/` closely. Keep filenames parallel for familiarity.

```
Query<T>.expression (existing AST)
    ↓  QueryBinder          LINQ Expression → DbExpression AST
    ↓  Optimisers           UnusedColumnRemover, RedundantSubqueryRemover, ConditionsRewriter
    ↓  QueryFormatter       DbExpression → SQL string + parameters (SqlServer / Postgres dialects)
    ↓  TranslatorBuilder    Compile projector lambda (row: DataRow) => T
    ↓  ProjectionReader     Execute SQL, materialise rows, set entity._snapshot
```

`DbExpression` node types (parallel to C# `DbExpressions.Sql.cs` + `DbExpressions.Signum.cs`):
`TableExpression`, `SelectExpression`, `JoinExpression`, `ProjectionExpression`,
`ColumnExpression`, `AggregateExpression`, `SqlConstantExpression`, `SqlParameterExpression`,
`EntityExpression`, `LiteReferenceExpression`, `EmbeddedInitExpression`.

---

## JSON serializer

| Value | Wire format |
|---|---|
| `Entity` | `{ "Type": "EmployeeEntity", "id": 1, "ticks": 0, ...fields }` |
| `LiteImp<T>` | `{ "Type": "Lite", "EntityType": "EmployeeEntity", "id": 1, "toStr": "John Smith" }` |
| `EmbeddedEntity` | Nested object, no `"id"` |
| `Date` / `Temporal.PlainDate` | `"2024-01-15"` |
| `Temporal.Instant` | `"2024-01-15T10:30:00Z"` |
| `T[]` | JSON array |

---

## Schema generator & synchronizer

```typescript
namespace SchemaGenerator {
    function createTablesScript(schema?: Schema): string    // CREATE TABLE + columns
    function createForeignKeysScript(schema?: Schema): string
    function createIndicesScript(schema?: Schema): string
}

namespace SchemaSynchronizer {
    async function synchronizeScript(
        connector: Connector,
        schema?: Schema,
        options?: { onReplacement?: (dbName: string, candidates: string[]) => string | null }
    ): Promise<SyncScript>
}

interface SyncScript {
    addTables: string[];    dropTables: string[];
    addColumns: string[];   dropColumns: string[];   modifyColumns: string[];
    addForeignKeys: string[]; dropForeignKeys: string[];
    addIndices: string[];   dropIndices: string[];
    toSql(): string;        // ordered: drops before creates, tables before FKs
}
```

---

## Milestone sequence

### Phase A — Initial (foundations)

| # | Milestone |
|---|---|
| 1 | Entity model: `ModifiableEntity` (+ `.init()`), `Entity`, `EmbeddedEntity`, `ModelEntity`, `Lite<out T>`, `LiteImp`, `PrimaryKey` |
| 2 | Transformer v2: auto-`@field` for `ModifiableEntity` subclasses, two-arg generics, array handling, `@fkProperty` |
| 3 | Decorators: `@stringLengthValidator`, `@urlValidator`, `@telephoneValidator`, `@emailValidator`, `@noRepeatValidator`, `@uniqueIndexValidator`, `@ignore`, `@fkProperty`, `@implementedBy`, `@implementedByAll`, `@entity`, `@allowUnauthenticated`, `EntityKind`, `EntityData` |
| 4 | FK dual properties: convention + `@fkProperty` override wired into `FieldInfo` |
| 9 | Mixin system: `@mixin`, `MixinDeclarations.register()`, `.mixin<M>()` cast |

*Goal: `EmployeeEntity.all.ts` compiles cleanly.*

### Phase B — Schema

| # | Milestone |
|---|---|
| 5 | `Schema`, `Table<T>`, `Field` hierarchy, `IColumn` |
| 8 | `SchemaBuilder` + `EntityBuilder` fluent chain: `include()`, `withQuery()`, `withSave()`, `withExpressionFrom()`, `withFullTextIndex()` |
| 15 | Schema generator: `Schema` → DDL (two dialects) |
| 16 | Schema synchronizer: DB introspection → diff → ordered `SyncScript` with rename hooks |

*Goal: `SchemaGenerator.createTablesScript()` produces valid SQL from entity definitions.*

### Phase C — Save

| # | Milestone |
|---|---|
| 6 | Snapshot & change detection: `takeSnapshot`, `diffSnapshot`, `isDirty` |
| 7 | Save / ORM + `GraphExplorer`: `save()`, `load()`, `tryLoad()`, `deleteEntity()`, `GraphExplorer.fromRoot/fullIntegrityCheck/dirtyInSaveOrder/toGraphviz` |

*Goal: port initial save tests from `Signum.Test/Engine/`.*

### Phase D — LINQ

| # | Milestone |
|---|---|
| 11 | Query extensions: `flatMap` back-FK join, `QueryLogic.queries.register`, `Connector` |
| 12 | Cross-module expressions: `withQuoted` + `declare module` convention, `withExpressionFrom` on `EntityBuilder` |
| 10 | Bulk ops: `executeDelete`, `executeUpdate`, `executeInsert` |
| 17 | SQL translator: full pipeline `QueryBinder` → optimisers → `QueryFormatter` → `TranslatorBuilder` → `ProjectionReader` + bulk DML |

*Goal: port `Signum.Test/LinqProvider/` tests in order: Select → Where → TakeSkip → OrderBy → SingleFirst → AllAny → SelectMany → GroupBy → UnsafeDelete → UnsafeUpdate.*

### Phase E — UI Preparation

| # | Milestone |
|---|---|
| 14 | JSON serializer (`EntitySerializer`) + `GraphExplorer.toGraphviz` (dev tool, lives in `all/`) |
| 13 | `QueryTokenString` typed `.nav()` — requires Phase D cross-module expressions to be in place |

---

## Dependency table

| # | Phase | Depends on |
|---|---|---|
| 1 | A | — |
| 2 | A | 1 |
| 3 | A | 1 |
| 4 | A | 1, 3 |
| 9 | A | 1, 3 |
| 5 | B | 1, 3, 4, 9 |
| 8 | B | 5 |
| 15 | B | 5, 8 |
| 16 | B | 5, 8, 15 |
| 6 | C | 1, 5 |
| 7 | C | 5, 6, 8 |
| 11 | D | 5, 8 |
| 12 | D | 8 |
| 10 | D | 11 |
| 17 | D | 5, 10, 11, 12 |
| 14 | E | 1, 7 |
| 13 | E | 12, 14 |
