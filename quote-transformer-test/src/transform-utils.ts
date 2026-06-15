import * as ts from 'typescript';
import * as path from 'path';
import transformerFactory from 'quote-transformer';

export function transformSource(source: string): string {
    const fileName = path.join(process.cwd(), '__test__.ts');
    const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.ESNext, true);

    const defaultHost = ts.createCompilerHost({});
    const customHost: ts.CompilerHost = {
        ...defaultHost,
        getSourceFile: (name, languageVersion) => {
            if (path.normalize(name) === path.normalize(fileName))
                return sourceFile;
            return defaultHost.getSourceFile(name, languageVersion);
        },
        fileExists: (name) => path.normalize(name) === path.normalize(fileName) || defaultHost.fileExists(name),
        readFile: (name) => path.normalize(name) === path.normalize(fileName) ? source : defaultHost.readFile(name),
    };

    const program = ts.createProgram([fileName], {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.CommonJS,
        moduleResolution: ts.ModuleResolutionKind.Node10,
        experimentalDecorators: true,
        skipLibCheck: true,
        strict: false,
    }, customHost);

    const transformer = transformerFactory(program, undefined, {
        ts,
        addDiagnostic: () => 0,
    } as any);

    const result = ts.transform(sourceFile, [transformer]);
    return ts.createPrinter().printFile(result.transformed[0]);
}

export function normalize(s: string): string {
    return s.replace(/\s+/g, ' ').trim();
}
