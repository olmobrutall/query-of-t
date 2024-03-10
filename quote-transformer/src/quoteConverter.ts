import type * as ts2 from 'typescript';

export class QuoteError {
    constructor(public node: ts2.Node, public message: string) {

    }
}

export function getQuoteConverter(tsInstance: typeof ts2) {

    const ts = tsInstance;
    var printer = ts.createPrinter();

    function binaryOperatorLiteral(sk: ts2.BinaryOperator): string | undefined {
        switch (sk) {

            case ts.SyntaxKind.AsteriskAsteriskToken: return "**";

            case ts.SyntaxKind.AsteriskToken: return "*";
            case ts.SyntaxKind.SlashToken: return "/";
            case ts.SyntaxKind.PercentToken: return "%";

            case ts.SyntaxKind.PlusToken: return "+";
            case ts.SyntaxKind.MinusToken: return "-";


            case ts.SyntaxKind.LessThanLessThanEqualsToken: return "<<";
            case ts.SyntaxKind.GreaterThanGreaterThanToken: return ">>";
            case ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken: return ">>>";

            case ts.SyntaxKind.LessThanToken: return "<";
            case ts.SyntaxKind.LessThanEqualsToken: return "<=";
            case ts.SyntaxKind.GreaterThanToken: return ">";
            case ts.SyntaxKind.GreaterThanEqualsToken: return ">=";
            case ts.SyntaxKind.InstanceOfKeyword: return "instanceof";

            case ts.SyntaxKind.EqualsEqualsToken: return "==";
            case ts.SyntaxKind.EqualsEqualsEqualsToken: return "===";
            case ts.SyntaxKind.ExclamationEqualsToken: return "!=";
            case ts.SyntaxKind.ExclamationEqualsEqualsToken: return "!==";

            case ts.SyntaxKind.AmpersandToken: return "&";
            case ts.SyntaxKind.BarToken: return "|";
            case ts.SyntaxKind.CaretToken: return "^";

            case ts.SyntaxKind.AmpersandAmpersandToken: return "&&";
            case ts.SyntaxKind.BarBarToken: return "||";

            case ts.SyntaxKind.QuestionQuestionToken: return "??";
        }
        return undefined;
    }

    function unaryOperatorLiteral(sk: ts2.PrefixUnaryOperator) {
        switch (sk) {

            case ts.SyntaxKind.PlusToken: return "+u";
            case ts.SyntaxKind.MinusToken: return "-u";
            case ts.SyntaxKind.TildeToken: return "~";
            case ts.SyntaxKind.ExclamationToken: return "!";
        }

        return undefined;
    }

    return function quoteExpression(node: ts2.Expression, idents: string[], initialThis?: boolean): ts2.Expression | QuoteError {

        if (ts.isBinaryExpression(node)) {

            const literal = binaryOperatorLiteral(node.operatorToken.kind);
            if (literal == null)
                return new QuoteError(node, "Unable to quote binary operator " + ts.tokenToString(node.operatorToken.kind));

            const left = quoteExpression(node.left, idents);
            if (left instanceof QuoteError)
                return left;

            const right = quoteExpression(node.right, idents);
            if (right instanceof QuoteError)
                return right;

            return ts.factory.createArrayLiteralExpression([
                ts.factory.createStringLiteral(literal),
                left,
                right
            ]);
        }

        if (ts.isPostfixUnaryExpression(node)) {

            const literal = unaryOperatorLiteral(node.operator);
            if (literal == null)
                return new QuoteError(node, "Unable to quote postfix unary operator " + ts.tokenToString(node.operator));

            const operand = quoteExpression(node.operand, idents);
            if (operand instanceof QuoteError)
                return operand;

            return ts.factory.createArrayLiteralExpression([
                ts.factory.createStringLiteral(literal),
                operand,
            ]);
        }

        if (ts.isPrefixUnaryExpression(node)) {

            const literal = unaryOperatorLiteral(node.operator);
            if (literal == null)
                return new QuoteError(node, "Unable to quote postfix unary operator " + ts.tokenToString(node.operator));

            const operand = quoteExpression(node.operand, idents);
            if (operand instanceof QuoteError)
                return operand;

            return ts.factory.createArrayLiteralExpression([
                ts.factory.createStringLiteral(literal),
                operand,
            ]);
        }

        if (ts.isParenthesizedExpression(node)) {
            return quoteExpression(node.expression, idents, initialThis);
        }

        if (ts.isConditionalExpression(node)) {

            const condition = quoteExpression(node.condition, idents);
            if (condition instanceof QuoteError)
                return condition;

            const whenTrue = quoteExpression(node.whenTrue, idents);
            if (whenTrue instanceof QuoteError)
                return whenTrue;

            const whenFalse = quoteExpression(node.whenFalse, idents);
            if (whenFalse instanceof QuoteError)
                return whenFalse;

            return ts.factory.createArrayLiteralExpression([
                ts.factory.createStringLiteral("?:"),
                condition,
                whenTrue,
                whenFalse
            ]);
        }


        if (ts.isStringLiteral(node) || ts.isNumericLiteral(node) ||
            node.kind == ts.SyntaxKind.TrueKeyword ||
            node.kind == ts.SyntaxKind.FalseKeyword ||
            node.kind == ts.SyntaxKind.NullKeyword ||
            node.kind == ts.SyntaxKind.UndefinedKeyword
        ) {
            return ts.factory.createArrayLiteralExpression([
                ts.factory.createStringLiteral("c"),
                node
            ]);
        }

        if (ts.isPropertyAccessExpression(node)) {
            const expr = quoteExpression(node.expression, idents);
            if (expr instanceof QuoteError)
                return expr;

            if (ts.isPrivateIdentifier(node))
                return new QuoteError(node, "Unable to quote private identifier " + ts.tokenToString(node));

            return ts.factory.createArrayLiteralExpression([
                ts.factory.createStringLiteral(node.questionDotToken ? "?." : "."),
                expr,
                ts.factory.createStringLiteral(node.name.text),
            ]);
        }

        if (ts.isCallExpression(node)) {
            const expr = quoteExpression(node.expression, idents);
            if (expr instanceof QuoteError)
                return expr;

            const args: ts2.Expression[] = [];
            for (let i = 0; i < node.arguments.length; i++) {
                const arg = quoteExpression(node.arguments[i], idents);
                if (arg instanceof QuoteError)
                    return arg;
                args.push(arg);
            }


            return ts.factory.createArrayLiteralExpression([
                ts.factory.createStringLiteral("()"),
                expr,
                ts.factory.createArrayLiteralExpression(args),
            ]);
        }

        if (ts.isNewExpression(node)) {
            const expr = quoteExpression(node.expression, idents);
            if (expr instanceof QuoteError)
                return expr;

            const args: ts2.Expression[] = [];
            if (node.arguments) {
                for (let i = 0; i < node.arguments.length; i++) {
                    const arg = quoteExpression(node.arguments[i], idents);
                    if (arg instanceof QuoteError)
                        return arg;
                    args.push(arg);
                }
            }

            return ts.factory.createArrayLiteralExpression([
                ts.factory.createStringLiteral("()"),
                expr,
                ts.factory.createArrayLiteralExpression(args),
            ]);
        }

        if (ts.isArrayLiteralExpression(node)) {
            const elems: ts2.Expression[] = [];
            if (node.elements) {
                for (let i = 0; i < node.elements.length; i++) {
                    const elem = node.elements[i];

                    const arg = quoteExpression(elem, idents);
                    if (arg instanceof QuoteError)
                        return arg;

                    elems.push(elem);
                }
            }

            return ts.factory.createArrayLiteralExpression([
                ts.factory.createStringLiteral("[]"),
                ts.factory.createArrayLiteralExpression(elems)
            ]);
        }

        if (ts.isObjectLiteralExpression(node)) {
            const props: ts2.PropertyAssignment[] = [];
            if (node.properties) {
                for (let i = 0; i < node.properties.length; i++) {
                    const p = node.properties[i];
                    if (ts.isShorthandPropertyAssignment(p)) {
                        const arg = quoteExpression(p.name, idents);
                        if (arg instanceof QuoteError)
                            return arg;

                        props.push(ts.factory.createPropertyAssignment(p.name, arg));
                    } else if (ts.isPropertyAssignment(p)) {
                        const arg = quoteExpression(p.initializer, idents);
                        if (arg instanceof QuoteError)
                            return arg;

                        props.push(ts.factory.createPropertyAssignment(p.name, arg));
                    }
                    else
                        return new QuoteError(p, "Unable to quote " + ts.SyntaxKind[node.kind]);

                }
            }

            return ts.factory.createArrayLiteralExpression([
                ts.factory.createStringLiteral("{}"),
                ts.factory.createObjectLiteralExpression(props, true)
            ]);
        }

        if (ts.isIdentifier(node)) {
            if (idents.indexOf(node.text) == -1)
                return ts.factory.createArrayLiteralExpression([
                    ts.factory.createStringLiteral("c"),
                    node
                ]);
            else
                return node;
        }

        if (node.kind == ts.SyntaxKind.ThisKeyword) {
            if (idents.indexOf("_this") == -1)
                return ts.factory.createArrayLiteralExpression([
                    ts.factory.createStringLiteral("c"),
                    node
                ]);
            else
                return ts.factory.createIdentifier("_this");
        }


        if (ts.isArrowFunction(node)) {

            //(a,b) => a + b
            const params: string[] = [];
            if (initialThis)
                params.push("_this");

            if (node.parameters) {
                for (let i = 0; i < node.parameters.length; i++) {
                    const p = node.parameters[i];
                    if (p.dotDotDotToken != null)
                        return new QuoteError(p, "Unable to quote ...");

                    if (!ts.isIdentifier(p.name))
                        return new QuoteError(p, "Unable to quote " + ts.SyntaxKind[node.kind]);

                    params.push(p.name.text);
                }
            }

            if (ts.isBlock(node.body))
                return new QuoteError(node.body, "Unable to quote expression blocks");

            //["+", a, b]
            const body = quoteExpression(node.body, [...idents, ...params]);
            if (body instanceof QuoteError)
                return body;

            //["=>", [a, b], ["+", a, b]]
            var result = ts.factory.createArrayLiteralExpression([
                ts.factory.createStringLiteral("=>"),
                ts.factory.createArrayLiteralExpression(params.map(a => ts.factory.createIdentifier(a))),
                body
            ]);

            //(a,b) => ["=>", [a, b], ["+", a, b]]
            var lambda = ts.factory.createArrowFunction(undefined, undefined,
                params.map(n => ts.factory.createParameterDeclaration(undefined, undefined, n)),
                undefined,
                ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                result
            );

            //((a,b) => ["=>", [a, b], ["+", a, b]])(["p", "a"], ["p", "b"])
            return ts.factory.createCallExpression(
                ts.factory.createParenthesizedExpression(lambda),
                undefined,
                params.map(p => ts.factory.createArrayLiteralExpression([
                    ts.factory.createStringLiteral("p"),
                    ts.factory.createStringLiteral(p),
                ]))
            );
        }

        return new QuoteError(node, "Unable to quote " + ts.SyntaxKind[node.kind]);
    }
}
