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
  let needsFieldImport = false;

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

  function isMsgCall(node: ts.CallExpression): boolean {
    if (!ts.isIdentifier(node.expression) || node.expression.text !== 'msg')
      return false;
    if (node.arguments.length === 0)
      return true;
    if (node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]))
      return true;
    return false;
  }

  function transformMsgCall(call: ts.CallExpression, memberName: string, moduleName: string): ts.CallExpression {
    const firstArg = call.arguments.length === 0
      ? ts.factory.createIdentifier('undefined')
      : call.arguments[0];
    return ts.factory.updateCallExpression(
      call,
      call.expression,
      call.typeArguments,
      [firstArg, ts.factory.createStringLiteral(memberName), ts.factory.createStringLiteral(moduleName)],
    );
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

  function isFieldDecorator(modifier: ts.ModifierLike): boolean {
    if (!ts.isDecorator(modifier)) return false;
    if (ts.isIdentifier(modifier.expression) && modifier.expression.text == "field") return true;
    if (ts.isCallExpression(modifier.expression) && ts.isIdentifier(modifier.expression.expression) && modifier.expression.expression.text == "field") {
      const args = modifier.expression.arguments;
      return !(args.length === 1 && args[0].kind === ts.SyntaxKind.FalseKeyword);
    }
    return false;
  }

  function isFieldFalseDecorator(modifier: ts.ModifierLike): boolean {
    if (!ts.isDecorator(modifier)) return false;
    if (!ts.isCallExpression(modifier.expression)) return false;
    if (!ts.isIdentifier(modifier.expression.expression) || modifier.expression.expression.text !== "field") return false;
    const args = modifier.expression.arguments;
    return args.length === 1 && args[0].kind === ts.SyntaxKind.FalseKeyword;
  }

  function isIgnoreDecorator(modifier: ts.ModifierLike): boolean {
    return ts.isDecorator(modifier) && (
      (ts.isIdentifier(modifier.expression) && modifier.expression.text == "ignore") ||
      (ts.isCallExpression(modifier.expression) && ts.isIdentifier(modifier.expression.expression) && modifier.expression.expression.text == "ignore")
    );
  }

  function hasEntityDecorator(node: ts.ClassDeclaration): boolean {
    return node.modifiers?.some(m =>
      ts.isDecorator(m) && (
        (ts.isIdentifier(m.expression) && m.expression.text === "entity") ||
        (ts.isCallExpression(m.expression) && ts.isIdentifier(m.expression.expression) && m.expression.expression.text === "entity")
      )
    ) ?? false;
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

  // Adds 'field' to an existing 'query-of-t' import if it's not already there.
  function ensureFieldImport(sourceFile: ts.SourceFile): ts.SourceFile {
    const hasFieldImport = sourceFile.statements.some(stmt => {
      if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier) || stmt.moduleSpecifier.text !== 'query-of-t') return false;
      const nb = stmt.importClause?.namedBindings;
      return nb != null && ts.isNamedImports(nb) && nb.elements.some(e => e.name.text === 'field');
    });
    if (hasFieldImport) return sourceFile;

    let patched = false;
    const newStatements = sourceFile.statements.map(stmt => {
      if (patched || !ts.isImportDeclaration(stmt)) return stmt;
      if (!ts.isStringLiteral(stmt.moduleSpecifier) || stmt.moduleSpecifier.text !== 'query-of-t') return stmt;
      const nb = stmt.importClause?.namedBindings;
      if (nb == null || !ts.isNamedImports(nb)) return stmt;
      patched = true;
      const newEl = ts.factory.createImportSpecifier(false, undefined, ts.factory.createIdentifier('field'));
      const newNb = ts.factory.updateNamedImports(nb, [...nb.elements, newEl]);
      const clause = stmt.importClause!;
      const newClause = ts.factory.updateImportClause(clause, clause.phaseModifier, clause.name, newNb);
      return ts.factory.updateImportDeclaration(stmt, stmt.modifiers, newClause, stmt.moduleSpecifier, stmt.attributes);
    });
    return patched ? ts.factory.updateSourceFile(sourceFile, newStatements) : sourceFile;
  }

  // Computes the @field factory args from a type annotation node.
  // First arg is always the element/inner type; second arg is an options object when needed.
  // e.g. @field(() => Person, { container: () => Array }) for Person[]
  //      @field(() => Number, { name: "int", nullable: true, container: () => Array }) for (int | null)[]
  function buildFieldFactories(typeNode: ts.TypeNode): ts.Expression[] | null {
    const resolved = resolveElementType(typeNode, false);
    if (resolved == null) return null;

    const { typeFactory, name, nullable, containerRef } = resolved;
    const hasOpts = name != null || nullable === true || containerRef != null;

    if (!hasOpts)
      return [typeFactory];

    const props: ts.ObjectLiteralElementLike[] = [];
    if (name != null)
      props.push(ts.factory.createPropertyAssignment("name", ts.factory.createStringLiteral(name)));
    if (nullable === true)
      props.push(ts.factory.createPropertyAssignment("nullable", ts.factory.createTrue()));
    if (containerRef != null)
      props.push(ts.factory.createPropertyAssignment("container", makeFactory(containerRef)));

    return [typeFactory, ts.factory.createObjectLiteralExpression(props)];
  }

  interface ElementTypeResult {
    typeFactory: ts.ArrowFunction;
    name?: string;
    nullable?: true;
    containerRef?: ts.Identifier | ts.PropertyAccessExpression;
  }

  // Resolves the element/inner type and any container/nullable metadata.
  // insideContainer=true: a | null on this node sets nullable on the result.
  function resolveElementType(typeNode: ts.TypeNode, insideContainer: boolean): ElementTypeResult | null {
    // (T | null)[] has elementType = ParenthesizedTypeNode — unwrap before processing
    let type: ts.TypeNode = typeNode;
    while (ts.isParenthesizedTypeNode(type)) type = type.type;

    let elementNullable: true | undefined;

    const stripped = extractNull(type);
    if (stripped) {
      type = stripped.cleanType;
      while (ts.isParenthesizedTypeNode(type)) type = type.type;
      if (!ts.isArrayTypeNode(type))
        elementNullable = true;
    }

    // T[] — array shorthand
    if (ts.isArrayTypeNode(type)) {
      const inner = resolveElementType(type.elementType, true);
      if (inner == null) return null;
      return { ...inner, containerRef: ts.factory.createIdentifier("Array") };
    }

    // Generic<T> with exactly one type arg
    if (ts.isTypeReferenceNode(type) && type.typeArguments?.length == 1) {
      const outerRef = toRuntimeReference(type.typeName);
      if (outerRef == null) return null;
      const inner = resolveElementType(type.typeArguments[0], true);
      if (inner == null) return null;
      return { ...inner, containerRef: outerRef, nullable: elementNullable ?? inner.nullable };
    }

    if (ts.isTypeReferenceNode(type) && !type.typeArguments?.length && ts.isIdentifier(type.typeName)) {
      // Primitive alias: type int = number  →  @field(() => Number, { name: "int" })
      const alias = resolvePrimitiveAlias(type);
      if (alias != null) {
        return {
          typeFactory: makeFactory(ts.factory.createIdentifier(alias.constructorName)),
          name: alias.aliasName,
          nullable: elementNullable,
        };
      }

      // Regular enum: Color  →  @field(() => Color, { name: "Color" })
      if (isEnumType(type)) {
        return {
          typeFactory: makeFactory(toRuntimeReference(type.typeName)!),
          name: type.typeName.text,
          nullable: elementNullable,
        };
      }
    }

    // Fallback: keyword (number, string, boolean) or plain class reference
    const typeRef = runtimeType(type);
    if (typeRef == null) return null;
    return { typeFactory: makeFactory(typeRef), nullable: elementNullable };
  }

  function resolvePrimitiveAlias(node: ts.TypeReferenceNode): { constructorName: string; aliasName: string } | null {
    const tsType = typeChecker.getTypeFromTypeNode(node);
    const aliasName = (node.typeName as ts.Identifier).text;

    if (tsType.flags & ts.TypeFlags.Number) return { constructorName: "Number", aliasName };
    if (tsType.flags & ts.TypeFlags.String) return { constructorName: "String", aliasName };
    if (tsType.flags & ts.TypeFlags.Boolean) return { constructorName: "Boolean", aliasName };
    if (tsType.flags & ts.TypeFlags.BigInt) return { constructorName: "BigInt", aliasName };

    return null;
  }

  function isEnumType(node: ts.TypeReferenceNode): boolean {
    const symbol = typeChecker.getSymbolAtLocation(node.typeName);
    return symbol != null && (symbol.flags & ts.SymbolFlags.RegularEnum) !== 0;
  }

  function makeFactory(ref: ts.Identifier | ts.PropertyAccessExpression): ts.ArrowFunction {
    return ts.factory.createArrowFunction(
      undefined,
      undefined,
      [],
      undefined,
      ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
      ref as ts.Expression,
    );
  }

  // Injects @field decorators for properties in a class decorated with @entity that are missing them.
  function injectMissingFieldDecorators(node: ts.ClassDeclaration, sourceFile: ts.SourceFile): ts.ClassDeclaration {
    const newMembers = node.members.map((member): ts.ClassElement => {
      if (!ts.isPropertyDeclaration(member))
        return member;

      const isStatic = member.modifiers?.some(m => m.kind === ts.SyntaxKind.StaticKeyword) ?? false;
      if (isStatic) return member;

      const hasField = member.modifiers?.some(m => isFieldDecorator(m)) ?? false;
      const hasIgnore = member.modifiers?.some(m => isIgnoreDecorator(m)) ?? false;
      const hasFieldFalse = member.modifiers?.some(m => isFieldFalseDecorator(m)) ?? false;
      if (hasField || hasIgnore || hasFieldFalse || !member.type) return member;

      const factories = buildFieldFactories(member.type);
      if (factories == null) {
        addNodeError(sourceFile, member.type, "Unable to make run-time reference for auto-injected @field");
        return member;
      }

      needsFieldImport = true;
      const fieldCall = ts.factory.createCallExpression(
        ts.factory.createIdentifier("field"),
        undefined,
        factories,
      );
      const fieldDecorator = ts.factory.createDecorator(fieldCall);

      const newModifiers: ts.ModifierLike[] = [fieldDecorator, ...(member.modifiers ?? [])];
      return ts.factory.updatePropertyDeclaration(
        member,
        newModifiers,
        member.name,
        member.questionToken ?? member.exclamationToken,
        member.type,
        member.initializer,
      );
    });

    return ts.factory.updateClassDeclaration(
      node,
      node.modifiers,
      node.name,
      node.typeParameters,
      node.heritageClauses,
      newMembers,
    );
  }

  return function myTransformer(ctx: ts.TransformationContext): ts.Transformer<ts.SourceFile> {

    return (sourceFile: ts.SourceFile) => {
      generatedExParam = false;
      needsFieldImport = false;
      let quotedContextDepth = 0;
      let msgModuleName: string | null = null;
      let msgMemberName: string | null = null;

      function visitWithQuotedContext<TNode extends ts.Node>(node: TNode): TNode {
        quotedContextDepth++;
        try {
          return ts.visitEachChild(node, visit, ctx) as TNode;
        } finally {
          quotedContextDepth--;
        }
      }

      function visit(node: ts.Node): ts.Node {

        // Track module name for msg() rewriting: module-level const X = { ... }
        if (ts.isVariableDeclaration(node) &&
          ts.isIdentifier(node.name) &&
          node.initializer && ts.isObjectLiteralExpression(node.initializer) &&
          ts.isVariableDeclarationList(node.parent) &&
          (node.parent.flags & ts.NodeFlags.Const) !== 0 &&
          ts.isVariableStatement(node.parent.parent) &&
          ts.isSourceFile(node.parent.parent.parent)
        ) {
          const prev = msgModuleName;
          msgModuleName = node.name.text;
          const result = ts.visitEachChild(node, visit, ctx);
          msgModuleName = prev;
          return result;
        }

        // Track member name for msg() rewriting: property keys inside the object
        if (ts.isPropertyAssignment(node) && msgModuleName != null) {
          const key = ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : null;
          if (key != null) {
            const prev = msgMemberName;
            msgMemberName = key;
            const result = ts.visitEachChild(node, visit, ctx);
            msgMemberName = prev;
            return result;
          }
        }

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

          const afterQuote = transformWithQuotedCall(visited, sourceFile);

          if (ts.isCallExpression(afterQuote) && isMsgCall(afterQuote) && msgModuleName != null && msgMemberName != null)
            return transformMsgCall(afterQuote, msgMemberName, msgModuleName);

          return afterQuote;
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

        if (ts.isClassDeclaration(node)) {
          // Check BEFORE visiting children (type checker works on original AST)
          const isEntity = hasEntityDecorator(node);
          const visited = ts.visitEachChild(node, visit, ctx) as ts.ClassDeclaration;

          if (!isEntity)
            return visited;

          return injectMissingFieldDecorators(visited, sourceFile);
        }

        if (ts.isPropertyDeclaration(node)) {

          if (node.type && node.modifiers) {
            const hasFieldDec = node.modifiers.some(m => isFieldDecorator(m));

            if (!hasFieldDec)
              return ts.visitEachChild(node, visit, ctx);

            const factories = buildFieldFactories(node.type);
            if (factories == null) {
              addNodeError(sourceFile, node.type, "Unable to take make run-time reference for @field");
              return node;
            }

            const modifiers = node.modifiers.map(m => {
              if (!ts.isDecorator(m))
                return m;

              if (ts.isIdentifier(m.expression) && m.expression.text == "field") {
                return ts.factory.createDecorator(ts.factory.createCallExpression(m.expression, undefined, factories));
              }

              if (!ts.isCallExpression(m.expression) || !ts.isIdentifier(m.expression.expression) || m.expression.expression.text != "field")
                return m;

              if (m.expression.arguments.length == 0)
                return ts.factory.createDecorator(ts.factory.createCallExpression(m.expression.expression, undefined, factories));

              // @field(type) already provided explicitly — leave as-is
              return m;
            });

            const result = ts.factory.updatePropertyDeclaration(node, modifiers, node.name, node.questionToken ?? node.exclamationToken, node.type, node.initializer);
            return result;
          }
        }

        return ts.visitEachChild(node, visit, ctx);
      }

      const transformed = ts.visitNode(sourceFile, visit) as ts.SourceFile;
      const withExParam = generatedExParam ? ensureQuotedImportHasExParam(transformed) : transformed;
      return needsFieldImport ? ensureFieldImport(withExParam) : withExParam;

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
