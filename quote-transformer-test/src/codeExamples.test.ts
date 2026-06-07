import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import transformerFactory from 'quote-transformer';

const sourceFilePath = path.resolve(__dirname, '../examples/codeExamples.source.ts');
const transformedFilePath = path.resolve(__dirname, '../examples/codeExamples.transformed.ts');

function transformFile(filePath: string): string {
    const program = ts.createProgram([filePath], {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.CommonJS,
        moduleResolution: ts.ModuleResolutionKind.Node10,
        experimentalDecorators: true,
        skipLibCheck: true,
    });

    const sourceFile = program.getSourceFile(filePath);
    if (!sourceFile)
        throw new Error(`Source file not found: ${filePath}`);

    const transformer = transformerFactory(program, undefined, {
        ts,
        addDiagnostic: () => 0,
    } as any);

    const result = ts.transform(sourceFile, [transformer]);
    return ts.createPrinter().printFile(result.transformed[0]);
}

describe('codeExamples', () => {
    test('matches codeExamples.transformed.ts', () => {
        const actual = transformFile(sourceFilePath);

        if (process.env['UPDATE_SNAPSHOTS']) {
            fs.writeFileSync(transformedFilePath, actual, 'utf8');
            return;
        }

        const expected = fs.readFileSync(transformedFilePath, 'utf8');
        expect(actual).toBe(expected);
    });
});
