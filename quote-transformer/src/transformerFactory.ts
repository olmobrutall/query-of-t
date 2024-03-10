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

  var quoteExpression = getQuoteConverter(ts)

  const typeChecker = program.getTypeChecker();

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
          else
            return quote;
        }



        if (ts.isPropertyDeclaration(node) && node.modifiers?.some(m => ts.isDecorator(m) && ts.isCallExpression(m.expression) && m.expression.expression.getText() == "quoted" && m.expression.arguments.length == 0)) {
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

              const qLambda = ts.factory.createArrowFunction(undefined, undefined, [], undefined,
                ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
                quote);

              var modifiers = node.modifiers.map(m =>
                ts.isDecorator(m) && ts.isCallExpression(m.expression) && ts.isIdentifier(m.expression.expression) && m.expression.expression.getText() == "quoted" ? ts.factory.createDecorator(ts.factory.createCallExpression(m.expression.expression, undefined, [qLambda])) : m)

              var result = ts.factory.updatePropertyDeclaration(node, modifiers, node.name, node.questionToken, node.type, node.initializer);

              return result;
            }
          }
        }

        return ts.visitEachChild(node, visit, ctx);
      }

      return ts.visitNode<ts.SourceFile, any>(sourceFile, visit);

    };
  };
}