import type * as ts from 'typescript';
import type { TransformerExtras, PluginConfig } from 'ts-patch';
/** Changes string literal 'before' to 'after' */
export default function transformerFactory(program: ts.Program, pluginConfig: PluginConfig | undefined, { ts, addDiagnostic }: TransformerExtras): (ctx: ts.TransformationContext) => ts.Transformer<ts.SourceFile>;
