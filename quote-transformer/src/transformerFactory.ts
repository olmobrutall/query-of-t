import type * as ts from 'typescript';
import type { TransformerExtras, PluginConfig } from 'ts-patch';
import { QuoteError, getQuoteConverter } from './quoteConverter';



/** Changes string literal 'before' to 'after' */
export default function transformerFactory(program: ts.Program, pluginConfig: PluginConfig | undefined, { ts, addDiagnostic }: TransformerExtras) {

  function isQuoteOfT(type: ts.Type) {
    return type.aliasSymbol?.name == "Quoted" && type.aliasTypeArguments?.length == 1;
  }

  function isQuotedLikeType(type: ts.Type): boolean {
    if (isQuoteOfT(type))
      return true;

    const quotedProperty = type.getProperty("__quoted");
    return quotedProperty != null;
  }

  function isQuoteTypedLValue(node: ts.Expression, typeChecker: ts.TypeChecker): boolean {
    const symbol = typeChecker.getSymbolAtLocation(node);
    if (symbol?.declarations != null) {
      for (const declaration of symbol.declarations) {
        if (
          (ts.isVariableDeclaration(declaration) ||
            ts.isPropertyDeclaration(declaration) ||
            ts.isParameter(declaration) ||
            ts.isPropertySignature(declaration)) &&
          declaration.type != null
        ) {
          const declaredType = typeChecker.getTypeFromTypeNode(declaration.type);
          if (isQuoteOfT(declaredType))
            return true;
        }
      }
    }

    return isQuoteOfT(typeChecker.getTypeAtLocation(node));
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

      if (isQuotedLikeType(paramType))
        return true;

      const signatureDeclaration = signature.getDeclaration();
      const parameterDeclaration = signatureDeclaration?.parameters?.[index];
      if (parameterDeclaration?.type != null) {
        const declaredParamType = typeChecker.getTypeFromTypeNode(parameterDeclaration.type);
        if (isQuotedLikeType(declaredParamType))
          return true;
      }

      return false;
    }

    if (
      ts.isBinaryExpression(node.parent) &&
      node.parent.operatorToken.kind == ts.SyntaxKind.EqualsToken &&
      node.parent.right === node
    ) {
      return isQuoteTypedLValue(node.parent.left, typeChecker);
    }

    if (ts.isVariableDeclaration(node.parent) && node.parent.initializer === node) {
      const declaredType = node.parent.type != null
        ? typeChecker.getTypeFromTypeNode(node.parent.type)
        : typeChecker.getTypeAtLocation(node.parent.name);

      return isQuotedLikeType(declaredType);
    }

    if (ts.isPropertyDeclaration(node.parent) && node.parent.initializer === node && node.parent.type != null) {
      const declaredType = typeChecker.getTypeFromTypeNode(node.parent.type);
      return isQuotedLikeType(declaredType);
    }

    return false;
  }

  const quoteExpression = getQuoteConverter(ts);

  const typeChecker = program.getTypeChecker();

  const printer = ts.createPrinter();
  let generatedExParam = false;

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

  function ensureQuotedImportHasExParam(sourceFile: ts.SourceFile): ts.SourceFile {
    const quotedModule = "quote-transformer/quoted";

    function noImportPhaseModifier(): ts.ImportPhaseModifierSyntaxKind | undefined {
      return undefined;
    }

    function hasExParamNamedImport(named: ts.NamedImports): boolean {
      return named.elements.some(e => {
        const imported = e.propertyName?.text ?? e.name.text;
        return imported == "ExParam";
      });
    }

    function createExParamImportSpecifier(): ts.ImportSpecifier {
      return ts.factory.createImportSpecifier(false, undefined, ts.factory.createIdentifier("ExParam"));
    }

    for (let i = 0; i < sourceFile.statements.length; i++) {
      const statement = sourceFile.statements[i];
      if (!ts.isImportDeclaration(statement))
        continue;

      if (!ts.isStringLiteral(statement.moduleSpecifier) || statement.moduleSpecifier.text != quotedModule)
        continue;

      const importClause = statement.importClause;
      if (importClause?.namedBindings && ts.isNamedImports(importClause.namedBindings)) {
        if (hasExParamNamedImport(importClause.namedBindings))
          return sourceFile;

        const updatedNamedImports = ts.factory.updateNamedImports(importClause.namedBindings, [
          ...importClause.namedBindings.elements,
          createExParamImportSpecifier(),
        ]);

        const updatedClause = ts.factory.updateImportClause(
          importClause,
          importClause.phaseModifier,
          importClause.name,
          updatedNamedImports,
        );

        const updatedImport = ts.factory.updateImportDeclaration(
          statement,
          statement.modifiers,
          updatedClause,
          statement.moduleSpecifier,
          statement.attributes,
        );

        const updatedStatements = [...sourceFile.statements];
        updatedStatements[i] = updatedImport;
        return ts.factory.updateSourceFile(sourceFile, updatedStatements);
      }

      const exParamImport = ts.factory.createImportDeclaration(
        undefined,
        ts.factory.createImportClause(noImportPhaseModifier(), undefined, ts.factory.createNamedImports([createExParamImportSpecifier()])),
        ts.factory.createStringLiteral(quotedModule),
      );

      const updatedStatements = [...sourceFile.statements];
      updatedStatements.splice(i + 1, 0, exParamImport);
      return ts.factory.updateSourceFile(sourceFile, updatedStatements);
    }

    const exParamImport = ts.factory.createImportDeclaration(
      undefined,
      ts.factory.createImportClause(noImportPhaseModifier(), undefined, ts.factory.createNamedImports([createExParamImportSpecifier()])),
      ts.factory.createStringLiteral(quotedModule),
    );

    return ts.factory.updateSourceFile(sourceFile, [exParamImport, ...sourceFile.statements]);
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

  function createQuotedArg(quote: ts.Expression): ts.ArrowFunction {
    generatedExParam = true;
    return ts.factory.createArrowFunction(
      undefined,
      undefined,
      [],
      ts.factory.createTypeReferenceNode("ExLambda", undefined),
      ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
      quote,
    );
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

      const quotedArg = createQuotedArg(quote);

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

    const quotedArg = createQuotedArg(quote);

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

    const quotedArg = createQuotedArg(quote);

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
      generatedExParam = false;
      let quotedContextDepth = 0;

      function visitWithQuotedContext<TNode extends ts.Node>(node: TNode): TNode {
        quotedContextDepth++;
        try {
          return ts.visitEachChild(node, visit, ctx) as TNode;
        } finally {
          quotedContextDepth--;
        }
      }

      function visit(node: ts.Node): ts.Node {

        if (ts.isCallExpression(node)) {
          let visited: ts.CallExpression;

          if (isWithQuotedCall(node) && node.arguments.length > 0) {
            const expression = ts.visitNode(node.expression, visit) as ts.LeftHandSideExpression;
            const updatedArguments = node.arguments.map((arg, index) =>
              index == 0
                ? visitWithQuotedContext(arg)
                : ts.visitNode(arg, visit) as ts.Expression
            );

            visited = ts.factory.updateCallExpression(
              node,
              expression,
              node.typeArguments,
              updatedArguments,
            );
          } else {
            visited = ts.visitEachChild(node, visit, ctx) as ts.CallExpression;
          }

          return transformWithQuotedCall(visited, sourceFile);
        }

        if (ts.isMethodDeclaration(node)) {
          const visited = node.modifiers?.some(isQuotedDecoratorNoArgs)
            ? visitWithQuotedContext(node)
            : ts.visitEachChild(node, visit, ctx) as ts.MethodDeclaration;

          return transformQuotedMethod(visited, sourceFile);
        }

        if (ts.isArrowFunction(node)) {
          const assignedToQuoted = assignedToQuoteOfT(node, typeChecker);
          const visited = assignedToQuoted
            ? visitWithQuotedContext(node)
            : ts.visitEachChild(node, visit, ctx) as ts.ArrowFunction;

          if (!(assignedToQuoted && quotedContextDepth == 0))
            return visited;

          var quote = quoteExpression(visited, []);

          if (quote instanceof QuoteError) {
            addQuoteError(sourceFile, quote);

            return visited;
          }
          else {
            const quotedArg = createQuotedArg(quote);

            return ts.factory.createCallExpression(
              ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier("Object"), "assign"),
              undefined,
              [
                visited,
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

            const result = ts.factory.updatePropertyDeclaration(node, modifiers, node.name, node.questionToken ?? node.exclamationToken, node.type, node.initializer);
            return result;
          }
        }

        return ts.visitEachChild(node, visit, ctx);
      }

      const transformed = ts.visitNode(sourceFile, visit) as ts.SourceFile;
      if (!generatedExParam)
        return transformed;

      return ensureQuotedImportHasExParam(transformed);

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

