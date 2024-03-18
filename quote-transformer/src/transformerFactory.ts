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

  return function myTransformer(ctx: ts.TransformationContext): ts.Transformer<ts.SourceFile> {

    return (sourceFile: ts.SourceFile) => {

      function visit(node: ts.Node): ts.Node {

        if (ts.isArrowFunction(node) && assignedToQuoteOfT(node, typeChecker)) {

          var quote = quoteExpression(node, []);

          if (quote instanceof QuoteError) {
            addDiagnostic({
              category: ts.DiagnosticCategory.Error,
              code: 9876,
              file: sourceFile,
              start: quote.node.getStart(),
              length: quote.node.getFullWidth(),
              messageText: quote.message
            });

            return node;
          }
          else {

            var comment = printer.printNode(ts.EmitHint.Unspecified, node, sourceFile);
            return ts.addSyntheticLeadingComment(quote, ts.SyntaxKind.MultiLineCommentTrivia, comment);
          }
        }

        if (ts.isPropertyDeclaration(node)) {

          if (node.modifiers?.some(m => ts.isDecorator(m) && ts.isCallExpression(m.expression) && m.expression.expression.getText() == "quoted" && m.expression.arguments.length == 0)) {

            if (node.initializer && ts.isArrowFunction(node.initializer)) {

              const isStatic = node.modifiers?.some(m => m.kind == ts.SyntaxKind.StaticKeyword);

              var quote = quoteExpression(node.initializer, [], !isStatic);

              if (quote instanceof QuoteError) {
                addDiagnostic({
                  category: ts.DiagnosticCategory.Error,
                  code: 9876,
                  file: sourceFile,
                  start: quote.node.getStart(),
                  length: quote.node.getFullWidth(),
                  messageText: quote.message
                });

                return node;
              }
              else {

                var comment = printer.printNode(ts.EmitHint.Unspecified, node.initializer, sourceFile);

                const qLambda = ts.factory.createArrowFunction(undefined, undefined, [], undefined,
                  ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                  ts.addSyntheticLeadingComment(quote, ts.SyntaxKind.MultiLineCommentTrivia, comment));

                const modifiers = node.modifiers.map(m =>
                  ts.isDecorator(m) && ts.isCallExpression(m.expression) && ts.isIdentifier(m.expression.expression) && m.expression.expression.getText() == "quoted" ? ts.factory.createDecorator(ts.factory.createCallExpression(m.expression.expression, undefined, [qLambda])) : m)

                const result = ts.factory.updatePropertyDeclaration(node, modifiers, node.name, node.questionToken, node.type, node.initializer);



                return result;
              }
            }
          }

          if (node.modifiers?.some(m => ts.isDecorator(m) && ts.isCallExpression(m.expression) && m.expression.expression.getText() == "column" && m.expression.arguments.length == 0)) {

            if (node.type) {
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
                addDiagnostic({
                  category: ts.DiagnosticCategory.Error,
                  code: 9876,
                  file: sourceFile,
                  start: type.getStart(),
                  length: type.getFullWidth(),
                  messageText: "Unable to take make run-time reference for @column"
                });
                return node;
              }

              const arrow = ts.factory.createArrowFunction(undefined, undefined, [], undefined,
                ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                typeRef as ts.Expression
              );

              const props: ts.PropertyAssignment[] = [
                ts.factory.createPropertyAssignment("type", arrow)
              ];

              if (isMList) props.push(ts.factory.createPropertyAssignment("mlist", ts.factory.createToken(ts.SyntaxKind.TrueKeyword)));
              if (isNullable) props.push(ts.factory.createPropertyAssignment("nullable", ts.factory.createToken(ts.SyntaxKind.TrueKeyword)));
              if (isLite) props.push(ts.factory.createPropertyAssignment("lite", ts.factory.createToken(ts.SyntaxKind.TrueKeyword)));

              const options = ts.factory.createObjectLiteralExpression(props, false);

              const modifiers = node.modifiers.map(m =>
                ts.isDecorator(m) && ts.isCallExpression(m.expression) && ts.isIdentifier(m.expression.expression) && m.expression.expression.getText() == "column" ? ts.factory.createDecorator(ts.factory.createCallExpression(m.expression.expression, undefined, [options])) : m)

              const result = ts.factory.updatePropertyDeclaration(node, modifiers, node.name, node.questionToken, node.type, node.initializer);

              return result;
            }
          }
        }

        return ts.visitEachChild(node, visit, ctx);
      }

      return ts.visitNode<ts.SourceFile, any>(sourceFile, visit);

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

