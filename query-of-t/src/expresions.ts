import { isOptionalChain } from "typescript";
import { ExLambda, OpBinary, OpUnary, Quoted, QuotedEx, ExParam } from 'quote-transformer/lib/quoted';
import { ArrayType, FunctionType as FunctionType, LiteralType, NewType, ObjectType, Type } from "./types";
import { OrderedQuery, Query } from "./query";
import { LambdaTypeResolver, ResultTypeResolver } from "./decorators";

type Visitor = (e: Expression) => Expression;

export abstract class Expression {
    constructor(
        public readonly kind: string,
        public readonly type: Type) {
    }

    abstract toString(): string;
    abstract visitChildren(visitor: Visitor): Expression;


    static fromQuotedLambda<T extends Function>(lambda: Quoted<T>, types: Type[]): LambdaExpression {
        if (!Array.isArray(lambda))
            throw new Error("The following lambda has not been quoted. Are you using ts-path and quote-transformer?");

        var bindings = new Map<ExParam, Expression>();

        return fromQuoted(lambda, types) as LambdaExpression;

        function fromQuoted(q: QuotedEx, lambdaArgTypes?: Type[]): Expression {

            switch (q[0]) {
                case "c":
                    return new ConstantExpression(q[1]);
                case "+u":
                case "-u":
                case "~":
                case "!":
                    return new UnaryExpression(q[0], fromQuoted(q[1]));
                case "**":
                case "*":
                case "/":
                case "%":
                case "+":
                case "-":
                case "<<":
                case ">>":
                case ">>>":
                case "<":
                case "<=":
                case ">":
                case ">=":
                case "instanceof":
                case "==":
                case "!=":
                case "===":
                case "!==":
                case "&":
                case "|":
                case "^":
                case "&&":
                case "||":
                case "??":
                    return new BinaryExpression(
                        q[0],
                        fromQuoted(q[1]),
                        fromQuoted(q[2])
                    );
                case "?:":
                    return new ConditionalExpression(
                        fromQuoted(q[1]),
                        fromQuoted(q[2]),
                        fromQuoted(q[3])
                    );
                case ".":
                    return new PropertyExpression(
                        fromQuoted(q[1]),
                        q[2],
                        false,
                    );
                case "?.":
                    return new PropertyExpression(
                        fromQuoted(q[1]),
                        q[2],
                        true,
                    );
                case "()":
                case "?.()":
                    {
                        const fun = fromQuoted(q[1]);
                        const args = q[2];
                        if (fun instanceof PropertyExpression) {


                            const obj = fun.object;
                            const type = obj.type instanceof ArrayType ? OrderedQuery :
                                obj.type instanceof NewType ? obj.type.consturctorFunction :
                                    undefined;

                            if (type == undefined)
                                throw new Error(`Unexpected object type when calling ${fun.propertyName}`);

                            const getLambdaType = Reflect.getMetadata("lambdaType", type, fun.propertyName) as LambdaTypeResolver[] | undefined;

                            const argsExp: Expression[] = [];
                            for (let i = 0; i < args.length; i++) {
                                const a = args[i];
                                if (a[0] == "=>") {
                                    const resolver = getLambdaType?.[i];

                                    if (resolver == null)
                                        throw new Error(`Missing @lambdaType docorator '${fun.propertyName}' for argument '${i}'`);

                                    const paramTypes = resolver(fun.object.type, ...argsExp.map(a => a.type));

                                    argsExp[i] = fromQuoted(a, paramTypes);
                                }
                                else {
                                    argsExp[i] = fromQuoted(a);
                                }
                            }

                            const quoted = Reflect.getMetadata("quoted", type, fun.propertyName) as (() => ExLambda) | undefined;
                            if (quoted) {

                                const lambda = quoted();

                                if (lambda[0] != "=>")
                                    throw new Error("Unexpected non-lambda");

                                lambda[1].forEach((p, i) => bindings.set(p, i == 0 ? obj : argsExp[i - 1]));
                                var body = fromQuoted(lambda[2]);
                                lambda[1].forEach((p, i) => bindings.delete(p));
                                return body;
                            }

                            const getResultType = Reflect.getMetadata("resultType", type, fun.propertyName) as ResultTypeResolver | undefined;
                            if (getResultType == null)
                                throw new Error(`Missing @resultType or @quoted docorator in function '${fun.propertyName}'`);

                            const resultType = getResultType(fun.object.type, ...argsExp.map(a => a.type));
                            return new CallExpression(fun, argsExp, resultType);

                        }

                        throw new Error("Unable to call function on node " + fun.toString());
                    }
                case "=>":
                    var params = q[1].map((p, i) => new ParameterExpression(p[1], types[i]));

                    q[1].forEach((p, i) => bindings.set(p, params[i]));
                    var body = fromQuoted(q[2]);
                    q[1].forEach((p, i) => bindings.delete(p));

                    return new LambdaExpression(params, body);

                case "{}":
                    const objectProperties: Record<string, Expression> = {};
                    for (const [name, value] of Object.entries(q[1])) {
                        objectProperties[name] = fromQuoted(value);
                    }
                    return new ObjectExpression(objectProperties);
                case "new":
                    return new NewExpression(
                        q[1],
                        q[2].map(arg => fromQuoted(arg))
                    );
                default:
                    throw new Error(`Unsupported quoted expression: ${JSON.stringify(q)}`);
            }
        }
    }

    static visitArray(expressions: ReadonlyArray<Expression>, visitor: Visitor): ReadonlyArray<Expression> {
        let newArguments: Expression[] | undefined;

        for (let i = 0; i < expressions.length; i++) {
            const newArg = visitor(expressions[i]);

            if (newArg !== expressions[i]) {
                if (!newArguments) {
                    // Create a new array only when the first change is detected
                    newArguments = expressions.slice(0, i);
                }
                newArguments.push(newArg);
            }
        }

        return newArguments as ReadonlyArray<Expression> ?? expressions;
    }
}

export class ConstantExpression extends Expression {
    constructor(
        public readonly value: unknown,
        type?: Type
    ) {
        super("c", type ?? ConstantExpression.calculateType(value));
    }

    private static calculateType(value: unknown): Type {
        if (value == null)
            return LiteralType.null;
        if (typeof value === "number")
            return LiteralType.number;

        if (typeof value === "string")
            return LiteralType.string;
        if (typeof value === "boolean")
            return LiteralType.boolean;
        if (typeof value === "object") {
            if (value.constructor == Object)
                return new ObjectType({});

            return new NewType((value as {}).constructor);
        }

        throw new Error("Unexpected");
    }

    toString(): string {

        if (typeof this.value == "function")
            return this.value.name ?? "<<function>>";

        return `${this.value}`;
    }

    visitChildren(visitor: Visitor): ConstantExpression {
        // Constants do not have child expressions to visit.
        return this;
    }
}

export class UnaryExpression extends Expression {
    constructor(
        public readonly kind: OpUnary,
        public readonly expression: Expression) {

        var type = kind == "!" ? LiteralType.boolean :
            kind == "~" ? LiteralType.number :
                kind == "-u" ? LiteralType.number :
                    kind == "+u" ? LiteralType.number : undefined;

        if (type == undefined)
            throw new Error("Unexpected kind " + kind);

        super(kind, type);
    }

    toString(): string {
        return `(${(this.kind == "-u" ? "-" : this.kind == "+u" ? "+" : this.kind)}${this.expression.toString()}`;
    }

    visitChildren(visitor: Visitor): UnaryExpression {

        var expression = visitor(this.expression);

        return this.updateUnary(expression);
    }

    updateUnary(expression: Expression): UnaryExpression {
        if (this.expression == expression)
            return this;

        return new UnaryExpression(this.kind, expression);
    }
}

export class BinaryExpression extends Expression {
    constructor(
        public readonly kind: OpBinary,
        public readonly left: Expression,
        public readonly right: Expression
    ) {
        super(kind, BinaryExpression.calculateType(kind, left, right));
    }

    private static calculateType(operator: OpBinary, left: Expression, right: Expression): Type {
        switch (operator) {
            case "**":
            case "*":
            case "/":
            case "%":
            case "+":
            case "-":
                return LiteralType.number;
            case "<":
            case "<=":
            case ">":
            case ">=":
                return LiteralType.boolean;
            case "&&":
            case "||":
            case "??":
                return left.type ?? right.type;
            // Add more cases as needed
            default:
                throw new Error("Unexpected operator " + operator);
        }
    }

    toString(): string {
        return `(${this.left.toString()} ${this.kind} ${this.right.toString()})`;
    }

    visitChildren(visitor: Visitor): BinaryExpression {
        const newLeft = visitor(this.left);
        const newRight = visitor(this.right);

        return this.updateBinary(newLeft, newRight);
    }

    updateBinary(left: Expression, right: Expression): BinaryExpression {
        if (this.left === left && this.right === right) {
            return this;
        }

        return new BinaryExpression(this.kind, left, right);
    }
}

export class ConditionalExpression extends Expression {
    constructor(
        public readonly condition: Expression,
        public readonly whenTrue: Expression,
        public readonly whenFalse: Expression
    ) {
        super("?:", ConditionalExpression.calculateType(whenTrue, whenFalse));
    }

    private static calculateType(trueExpression: Expression, falseExpression: Expression): Type {
        // Choose the type based on the types of trueExpression and falseExpression.
        // For simplicity, this example assumes both expressions have the same type.
        // You might want to enhance this logic based on your specific use case.
        return trueExpression.type || falseExpression.type;
    }

    toString(): string {
        return `(${this.condition.toString()} ? ${this.whenTrue.toString()} : ${this.whenFalse.toString()})`;
    }

    visitChildren(visitor: Visitor): ConditionalExpression {
        const newCondition = visitor(this.condition);
        const newTrueExpression = visitor(this.whenTrue);
        const newFalseExpression = visitor(this.whenFalse);

        return this.updateConditional(newCondition, newTrueExpression, newFalseExpression);
    }

    updateConditional(condition: Expression, whenTrue: Expression, whenFalse: Expression): ConditionalExpression {
        if (this.condition === condition && this.whenTrue === whenTrue && this.whenFalse === whenFalse) {
            return this;
        }

        return new ConditionalExpression(condition, whenTrue, whenFalse);
    }
}

export class PropertyExpression extends Expression {
    constructor(
        public readonly object: Expression,
        public readonly propertyName: string,
        public readonly isOptionalChaining: boolean = false
    ) {
        super(".", PropertyExpression.calculateType(object, propertyName));
    }

    private static calculateType(object: Expression, propertyName: string): Type {
        if (object instanceof ObjectExpression)
            return object.properties[propertyName].type;

        return LiteralType.null; /* ?? */
    }

    toString(): string {
        const operatorString = this.isOptionalChaining ? "?. " : ".";

        let baseStr = this.object.toString();
        if (!(
            this.object instanceof ParameterExpression ||
            this.object instanceof ConstantExpression ||
            this.object instanceof PropertyExpression ||
            this.object instanceof CallExpression))
            baseStr = "(" + baseStr + ")";

        return `${baseStr}${operatorString}${this.propertyName}`;
    }

    visitChildren(visitor: Visitor): PropertyExpression {
        const newObject = visitor(this.object);

        return this.updateProperty(newObject);
    }

    updateProperty(object: Expression): PropertyExpression {
        if (this.object === object) {
            return this;
        }

        return new PropertyExpression(object, this.propertyName, this.isOptionalChaining);
    }
}

export class CallExpression extends Expression {
    constructor(
        public readonly func: Expression,
        public readonly args: readonly Expression[],
        public readonly type: Type,
        public readonly isOptionalChaining: boolean = false
    ) {
        super("()", type);
    }

    toString(): string {
        const operatorString = !this.isOptionalChaining ? "" : "?.";
        const argumentsString = this.args.map(arg => arg.toString()).join(', ');

        var baseStr = this.func.toString();
        if (!(
            this.func instanceof ParameterExpression ||
            this.func instanceof ConstantExpression ||
            this.func instanceof PropertyExpression ||
            this.func instanceof CallExpression))
            baseStr = "(" + baseStr + ")";

        return `${baseStr}${operatorString}(${argumentsString})`;
    }

    visitChildren(visitor: Visitor): CallExpression {
        const newExpresion = visitor(this.func);
        const newArgs = this.args.map(arg => visitor(arg));

        return this.updateCall(newExpresion, newArgs);
    }

    updateCall(func: Expression, args: readonly Expression[]): CallExpression {
        if (this.func === func && this.args === args) {
            return this;
        }

        return new CallExpression(func, args, this.isOptionalChaining);
    }
}

export class ParameterExpression extends Expression {
    constructor(
        public readonly name: string,
        type: Type
    ) {
        super("p", type);
    }

    toString(): string {
        return this.name;
    }

    visitChildren(visitor: Visitor): ParameterExpression {
        return this;
    }
}

export class LambdaExpression extends Expression {
    constructor(
        public readonly parameters: ParameterExpression[],
        public readonly body: Expression
    ) {
        super("=>", new FunctionType(body.type));
    }

    toString(): string {
        const parametersString = this.parameters.map(param => param.toString()).join(', ');
        return `${parametersString} => ${this.body.toString()}`;
    }

    visitChildren(visitor: Visitor): LambdaExpression {
        const newBody = visitor(this.body);

        return this.updateLambda(this.parameters, newBody);
    }

    updateLambda(parameters: ParameterExpression[], body: Expression): LambdaExpression {
        if ((this.parameters === parameters || this.parameters.length == parameters.length && this.parameters.every((param, index) => param === parameters[index]))
            && this.body === body) {
            return this;
        }

        return new LambdaExpression(parameters, body);
    }
}

export class ObjectExpression extends Expression {
    constructor(
        public readonly properties: Readonly<Record<string, Expression>>
    ) {
        var type = new ObjectType(Object.fromEntries(Object.entries(properties).map(([name, exp]) => [name, exp.type])));

        super("{}", type);
    }

    toString(): string {
        const propertiesString = Object.entries(this.properties)
            .map(([name, value]) => `${name}: ${value.toString()}`)
            .join(',\n');

        return `{\n${propertiesString}\n}`;
    }

    visitChildren(visitor: Visitor): ObjectExpression {
        let newProperties: Record<string, Expression> | undefined;

        for (const [name, value] of Object.entries(this.properties)) {
            const newValue = visitor(value);

            if (newValue !== value) {
                if (!newProperties) {
                    // Create a new object only when the first change is detected
                    newProperties = { ...this.properties };
                }
                newProperties[name] = newValue;
            }
        }

        return newProperties ? this.updateObject(newProperties) : this;
    }

    updateObject(properties: Record<string, Expression>): ObjectExpression {
        if (this.properties === properties) {
            return this;
        }

        return new ObjectExpression(properties);
    }
}

export class NewExpression extends Expression {
    constructor(
        public readonly constructorFunction: Function,
        public readonly args: ReadonlyArray<Expression>
    ) {
        super("new", new NewType(constructorFunction));
    }

    toString(): string {
        const argumentsString = this.args.map(arg => arg.toString()).join(', ');
        return `new ${this.constructorFunction.toString()}(${argumentsString})`;
    }

    visitChildren(visitor: Visitor): NewExpression {

        var newArgs = Expression.visitArray(this.args, visitor);
        return this.updateNew(newArgs);
    }

    updateNew(args: ReadonlyArray<Expression>): NewExpression {
        if (this.args === args) {
            return this;
        }

        return new NewExpression(this.constructorFunction, args);
    }
}

function getType(object: Expression, propertyName: string): Type {
    throw new Error("Function not implemented.");
}
