import type * as ts from 'typescript';
import type { TransformerExtras, PluginConfig } from 'ts-patch';
import { QuoteError, getQuoteConverter } from './quoteConverter';



/** Changes string literal 'before' to 'after' */
export default function transformerFactory(program: ts.Program, pluginConfig: PluginConfig | undefined, { ts, addDiagnostic }: TransformerExtras) {

  function isQuoteOfT(type: ts.Type) {
    return type.aliasSymbol?.name == "Quoted" && type.aliasTypeArguments?.length == 1;
  }

  function assignedToQuoteOfT(node: ts.ArrowFunction, typeChecker: ts.TypeChecker): boolean {

    if (node.parent == null)
      return false;

    if (ts.isCallExpression(node.parent)) {
      var index = node.parent.arguments.indexOf(node);

      if (index == -1)
        return false;

      var signature = typeChecker.getResolvedSignature(node.parent)
      if (signature == null)
        return false;

      var paramType = signature.getTypeParameterAtPosition(index);

      return isQuoteOfT(paramType);
    }

    return false;
  }

  const quoteExpression = getQuoteConverter(ts);

  const typeChecker = program.getTypeChecker();

  const printer = ts.createPrinter();

  function addQuoteError(sourceFile: ts.SourceFile, quote: QuoteError): void {
    addDiagnostic({
      category: ts.DiagnosticCategory.Error,
      code: 9876,
      file: sourceFile,
      start: quote.node.getStart(),
      length: quote.node.getFullWidth(),
      messageText: quote.message
    });
  }

  function addNodeError(sourceFile: ts.SourceFile, node: ts.Node, messageText: string): void {
    addDiagnostic({
      category: ts.DiagnosticCategory.Error,
      code: 9876,
      file: sourceFile,
      start: node.getStart(),
      length: node.getFullWidth(),
      messageText,
    });
  }

  function isWithQuotedCall(node: ts.CallExpression): boolean {
    return ts.isIdentifier(node.expression) && node.expression.text == "withQuoted";
  }

  function isQuotedDecoratorNoArgs(modifier: ts.ModifierLike): boolean {
    return ts.isDecorator(modifier) && (
      (ts.isCallExpression(modifier.expression) && ts.isIdentifier(modifier.expression.expression) && modifier.expression.expression.text == "quoted" && modifier.expression.arguments.length == 0) ||
      (ts.isIdentifier(modifier.expression) && modifier.expression.text == "quoted")
    );
  }

  function hasThisReference(node: ts.Node): boolean {
    let found = false;
    const walk = (n: ts.Node) => {
      if (found)
        return;

      if (ts.isThisTypeNode(n) || n.kind == ts.SyntaxKind.ThisKeyword) {
        found = true;
        return;
      }

      ts.forEachChild(n, walk);
    };

    walk(node);
    return found;
  }

  function transformWithQuotedCall(node: ts.CallExpression, sourceFile: ts.SourceFile): ts.CallExpression {
    if (!isWithQuotedCall(node) || node.arguments.length != 1)
      return node;

    const first = node.arguments[0];

    if (ts.isArrowFunction(first)) {
      const quote = quoteExpression(first, []);
      if (quote instanceof QuoteError) {
        addQuoteError(sourceFile, quote);
        return node;
      }

      const quotedArg = ts.factory.createArrowFunction(
        undefined,
        undefined,
        [],
        ts.factory.createTypeReferenceNode("ExLambda", undefined),
        ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
        quote,
      );

      return ts.factory.updateCallExpression(
        node,
        node.expression,
        node.typeArguments,
        [first, quotedArg]
      );
    }

    if (!ts.isFunctionExpression(first)) {
      addNodeError(sourceFile, first, "withQuoted expects a lambda or function expression");
      return node;
    }

    if (!ts.isBlock(first.body)) {
      addNodeError(sourceFile, first.body, "withQuoted function expression must have a block body with exactly one return statement");
      return node;
    }

    const returnStatements = first.body.statements.filter(s => ts.isReturnStatement(s));
    if (first.body.statements.length != 1 || returnStatements.length != 1 || returnStatements[0].expression == null) {
      addNodeError(sourceFile, first.body, "withQuoted function expression must have exactly one return statement");
      return node;
    }

    const thisParams = first.parameters.filter(p => ts.isIdentifier(p.name) && p.name.text == "this");
    if (thisParams.length > 1) {
      addNodeError(sourceFile, first, "withQuoted function expression can declare at most one this parameter");
      return node;
    }

    const declaredThis = thisParams.length == 1;
    const usesThis = hasThisReference(first.body);
    if (usesThis && !declaredThis) {
      addNodeError(sourceFile, first, "withQuoted function expression uses this but does not declare a this parameter");
      return node;
    }

    const parameters = first.parameters.filter(p => !(ts.isIdentifier(p.name) && p.name.text == "this"));
    const syntheticArrow = ts.factory.createArrowFunction(
      undefined,
      undefined,
      parameters,
      undefined,
      ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
      returnStatements[0].expression,
    );

    const quote = quoteExpression(syntheticArrow, [], declaredThis);
    if (quote instanceof QuoteError) {
      addQuoteError(sourceFile, quote);
      return node;
    }

    const quotedArg = ts.factory.createArrowFunction(
      undefined,
      undefined,
      [],
      ts.factory.createTypeReferenceNode("ExLambda", undefined),
      ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
      quote,
    );

    return ts.factory.updateCallExpression(
      node,
      node.expression,
      node.typeArguments,
      [first, quotedArg]
    );
  }

  function methodSingleReturnExpression(node: ts.MethodDeclaration): ts.Expression | null {
    if (node.body == null)
      return null;

    const statements = node.body.statements;
    const returnStatements = statements.filter(s => ts.isReturnStatement(s));
    if (statements.length != 1 || returnStatements.length != 1 || returnStatements[0].expression == null)
      return null;

    return returnStatements[0].expression;
  }

  function transformQuotedMethod(node: ts.MethodDeclaration, sourceFile: ts.SourceFile): ts.MethodDeclaration {
    if (!node.modifiers?.some(isQuotedDecoratorNoArgs))
      return node;

    const returnExpression = methodSingleReturnExpression(node);
    if (returnExpression == null) {
      addNodeError(sourceFile, node, "@quoted methods must have exactly one return statement");
      return node;
    }

    const isStatic = node.modifiers?.some(m => m.kind == ts.SyntaxKind.StaticKeyword) ?? false;
    const syntheticArrow = ts.factory.createArrowFunction(
      undefined,
      undefined,
      node.parameters,
      undefined,
      ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
      returnExpression,
    );

    const quote = quoteExpression(syntheticArrow, [], !isStatic);
    if (quote instanceof QuoteError) {
      addQuoteError(sourceFile, quote);
      return node;
    }

    const quotedArg = ts.factory.createArrowFunction(
      undefined,
      undefined,
      [],
      ts.factory.createTypeReferenceNode("ExLambda", undefined),
      ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
      quote,
    );

    const modifiers = node.modifiers.map(m => {
      if (!ts.isDecorator(m))
        return m;

      if (ts.isCallExpression(m.expression) && ts.isIdentifier(m.expression.expression) && m.expression.expression.text == "quoted" && m.expression.arguments.length == 0) {
        return ts.factory.createDecorator(ts.factory.createCallExpression(m.expression.expression, undefined, [quotedArg]));
      }

      if (ts.isIdentifier(m.expression) && m.expression.text == "quoted") {
        return ts.factory.createDecorator(ts.factory.createCallExpression(m.expression, undefined, [quotedArg]));
      }

      return m;
    });

    return ts.factory.updateMethodDeclaration(
      node,
      modifiers,
      node.asteriskToken,
      node.name,
      node.questionToken,
      node.typeParameters,
      node.parameters,
      node.type,
      node.body,
    );
  }

  return function myTransformer(ctx: ts.TransformationContext): ts.Transformer<ts.SourceFile> {

    return (sourceFile: ts.SourceFile) => {

      function visit(node: ts.Node): ts.Node {

        if (ts.isCallExpression(node)) {
          const visited = ts.visitEachChild(node, visit, ctx) as ts.CallExpression;
          return transformWithQuotedCall(visited, sourceFile);
        }

        if (ts.isMethodDeclaration(node)) {
          const visited = ts.visitEachChild(node, visit, ctx) as ts.MethodDeclaration;
          return transformQuotedMethod(visited, sourceFile);
        }

        if (ts.isArrowFunction(node) && assignedToQuoteOfT(node, typeChecker)) {

          var quote = quoteExpression(node, []);

          if (quote instanceof QuoteError) {
            addQuoteError(sourceFile, quote);

            return node;
          }
          else {
            const quotedArg = ts.factory.createArrowFunction(
              undefined,
              undefined,
              [],
              ts.factory.createTypeReferenceNode("ExLambda", undefined),
              ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
              quote,
            );

            return ts.factory.createCallExpression(
              ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier("Object"), "assign"),
              undefined,
              [
                node,
                ts.factory.createObjectLiteralExpression([
                  ts.factory.createPropertyAssignment("__quoted", quotedArg),
                ], true),
              ],
            );
          }
        }

        if (ts.isPropertyDeclaration(node)) {

          if (node.type && node.modifiers) {
            const hasFieldDecorator = node.modifiers.some(m =>
              ts.isDecorator(m) && (
                (ts.isIdentifier(m.expression) && m.expression.text == "field") ||
                (ts.isCallExpression(m.expression) && ts.isIdentifier(m.expression.expression) && m.expression.expression.text == "field")
              ));

            if (!hasFieldDecorator)
              return ts.visitEachChild(node, visit, ctx);

            let type = node.type;
            let isMList = false;
            let isNullable = false;
            let isLite = false;

            const mlist = extractMList(type);
            if (mlist) {
              type = mlist.elementType;
              isMList = true;
            }
            const nullable = extractNull(type);
            if (nullable) {
              type = nullable.cleanType;
              isNullable = true;
            }
            const lite = extractLite(type);
            if (lite) {
              type = lite.entityType;
              isLite = true;
            }

            const typeRef = runtimeType(type);
            if (typeRef == null) {
              addNodeError(sourceFile, type, "Unable to take make run-time reference for @field");
              return node;
            }

            const typeFactory = ts.factory.createArrowFunction(undefined, undefined, [], undefined,
              ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
              typeRef as ts.Expression
            );

            const modifiers = node.modifiers.map(m => {
              if (!ts.isDecorator(m))
                return m;

              if (ts.isIdentifier(m.expression) && m.expression.text == "field") {
                return ts.factory.createDecorator(ts.factory.createCallExpression(m.expression, undefined, [typeFactory]));
              }

              if (!ts.isCallExpression(m.expression) || !ts.isIdentifier(m.expression.expression) || m.expression.expression.text != "field")
                return m;

              if (m.expression.arguments.length == 0)
                return ts.factory.createDecorator(ts.factory.createCallExpression(m.expression.expression, undefined, [typeFactory]));

              // @field(type) already provided explicitly.
              return m;
            });

            const result = ts.factory.updatePropertyDeclaration(node, modifiers, node.name, node.questionToken, node.type, node.initializer);
            return result;
          }
        }

        return ts.visitEachChild(node, visit, ctx);
      }

      return ts.visitNode(sourceFile, visit) as ts.SourceFile;

    };
  };



  function extractNull(node: ts.TypeNode): { cleanType: ts.TypeNode } | null {
    if (ts.isUnionTypeNode(node)) {
      if (node.types.some(t => ts.isLiteralTypeNode(t) && t.literal.kind == ts.SyntaxKind.NullKeyword)) {
        var other = node.types.filter(t => !(ts.isLiteralTypeNode(t) && t.literal.kind == ts.SyntaxKind.NullKeyword));

        if (other.length == 1)
          return ({ cleanType: other[0] });
      }
    }

    return null;
  }

  function extractMList(node: ts.TypeNode): { elementType: ts.TypeNode } | null {
    if (ts.isTypeReferenceNode(node) && cleanTypeName(node.typeName) == "MList" && node.typeArguments?.length == 1) {
      return { elementType: node.typeArguments[0] };
    }
    return null;
  }

  function extractLite(node: ts.TypeNode): { entityType: ts.TypeNode } | null {
    if (ts.isTypeReferenceNode(node) && cleanTypeName(node.typeName) == "Lite" && node.typeArguments?.length == 1) {
      return { entityType: node.typeArguments[0] };
    }
    return null;
  }

  function cleanTypeName(name: ts.EntityName): string | undefined {
    return ts.isQualifiedName(name) ? cleanTypeName(name.right) :
      ts.isIdentifier(name) ? name.text :
        undefined;
  }

  function runtimeType(node: ts.TypeNode): ts.Identifier | ts.PropertyAccessExpression | null {
    if (node.kind == ts.SyntaxKind.BooleanKeyword)
      return ts.factory.createIdentifier("Boolean");

    if (node.kind == ts.SyntaxKind.NumberKeyword)
      return ts.factory.createIdentifier("Number");

    if (node.kind == ts.SyntaxKind.StringKeyword)
      return ts.factory.createIdentifier("String");

    if (ts.isTypeReferenceNode(node))
      return toRuntimeReference(node.typeName);

    return null;
  }

  function toRuntimeReference(name: ts.EntityName): ts.Identifier | ts.PropertyAccessExpression | null {
    if (ts.isQualifiedName(name)) {
      var left = toRuntimeReference(name.left);
      if (left == null)
        return null;
      return ts.factory.createPropertyAccessExpression(left, name.right.text);
    }

    if (ts.isIdentifier(name))
      return name;

    return null;
  }
}

