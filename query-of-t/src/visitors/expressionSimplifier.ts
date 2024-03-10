import { OpBinary, OpUnary } from "quote-transformer/lib/quoted";
import { BinaryExpression, CallExpression, ConditionalExpression, ConstantExpression, Expression, LambdaExpression, NewExpression, ObjectExpression, ParameterExpression, PropertyExpression, UnaryExpression } from "../expresions";
import { LiteralType, Type } from "../types";


export function expressionSimplifier() {

    function visit(e: Expression): Expression {


        if (e instanceof ConstantExpression)
            return e;

        if (e instanceof BinaryExpression) {
            switch (e.kind) {
                case "&&":
                    {
                        const left = visit(e.left);
                        if (left instanceof ConstantExpression)
                            if (!left.value)
                                return left; //Short circuit

                        const right = visit(e.right);
                        return e.updateBinary(left, right);
                    }

                case "||":
                    {
                        const left = visit(e.left);
                        if (left instanceof ConstantExpression)
                            if (left.value)
                                return left; //Short circuit

                        const right = visit(e.right);
                        return e.updateBinary(left, right);
                    }
                default: {
                    const left = visit(e.left);
                    const right = visit(e.right);

                    if (!(left instanceof ConstantExpression) ||
                        !(right instanceof ConstantExpression))
                        return e.updateBinary(left, right);

                    const leftValue = left.value;
                    const rightValue = right.value;

                    const value = evalBinary(leftValue, rightValue, e.kind);

                    return new ConstantExpression(value);
                }
            }
        }

        if (e instanceof UnaryExpression) {
            const exp = visit(e.expression);
            if (!(exp instanceof ConstantExpression))
                return e.updateUnary(exp);

            const val = evalUnary(exp.value, e.kind);

            return new ConstantExpression(val);
        }

        if (e instanceof ConditionalExpression) {
            const condition = visit(e.condition);
            if (condition instanceof ConstantExpression)
                return condition.value ? visit(e.whenTrue) : visit(e.whenFalse);
            else {
                const whenTrue = visit(e.whenTrue);
                const whenFalse = visit(e.whenFalse);
                return e.updateConditional(condition, whenTrue, whenFalse);
            }
        }

        if (e instanceof PropertyExpression) {
            const obj = visit(e.object);

            if (obj instanceof FastUndefined)
                return obj;

            if (obj instanceof ConstantExpression) {
                if (obj.value == null && e.isOptionalChaining)
                    return new FastUndefined();

                return new ConstantExpression((obj.value as any)[e.propertyName]);
            }

            else {
                return e.updateProperty(obj);
            }
        }

        if (e instanceof CallExpression) {

            const func = visit(e.func);

            if (func instanceof FastUndefined)
                return func;

            if (func instanceof ConstantExpression) {
                if (func.value == null && e.isOptionalChaining)
                    return new FastUndefined();
            }

            var args = Expression.visitArray(e.args, visit);

            return e.updateCall(func, args)
        }

        if (e instanceof ParameterExpression)
            return e;

        if (e instanceof LambdaExpression)
            return e.visitChildren(visit);

        if (e instanceof ObjectExpression) {
            const obj = e.visitChildren(visit);

            if (Object.values(obj.properties).every(a => a instanceof ConstantExpression)) {

                const valObj = Object.entries(obj.properties).map(([name, call]) => [name, (call as ConstantExpression).value]);

                return new ConstantExpression(Object.fromEntries(valObj));
            }

            return obj;
        }

        if (e instanceof NewExpression) {
            var args = Expression.visitArray(e.args, visit);

            if (args.every(a => a instanceof ConstantExpression)) {
                const argsConst = args.map(a => (a as ConstantExpression).value);

                const valObj = new (e.constructorFunction as any)(...argsConst);

                return new ConstantExpression(valObj);
            }

        }

        throw new Error("Unexcpected expression" + e.toString());

    }

    class FastUndefined extends ConstantExpression {
        constructor() {
            super(undefined);
        }
    }


    return function (e: Expression) {

        const b = visit(e);

        if (b instanceof FastUndefined)
            return new ConstantExpression(undefined);

        return b;
    }
}

function evalUnary(a: unknown, op: OpUnary) {
    switch (op) {
        case "!": return !a;
        case "+u": return +(a as number);
        case "-u": return -(a as number);
        case "~": return ~(a as number);
        default: throw new Error(op);
    }
}

function evalBinary(a: unknown, b: unknown, op: OpBinary) {
    switch (op) {
        case "!=": return a != b;
        case "!==": return a !== b;
        case "%": return (a as number) % (b as number);
        case "&": return (a as number) & (b as number);
        case "&&": return (a as number) && (b as number);
        case "*": return (a as number) * (b as number);
        case "**": return (a as number) ** (b as number);
        case "+": return (a as number) + (b as number);
        case "-": return (a as number) - (b as number);
        case "/": return (a as number) / (b as number);
        case "<": return (a as number) < (b as number);
        case "<<": return (a as number) << (b as number);
        case "<=": return (a as number) <= (b as number);
        case "==": return (a as number) == (b as number);
        case "===": return (a as number) === (b as number);
        case ">": return (a as number) > (b as number);
        case ">=": return (a as number) >= (b as number);
        case ">>": return (a as number) >> (b as number);
        case ">>": return (a as number) >> (b as number);
        case ">>>": return (a as number) >> (b as number);
        case "??": return a ?? b;
        case "^": return (a as number) ^ (b as number);
        case "instanceof": return a instanceof (b as Function);
        case "|": return (a as number) | (b as number);
        case "||": return (a as number) || (b as number);
        default: throw new Error(op);
    }
}