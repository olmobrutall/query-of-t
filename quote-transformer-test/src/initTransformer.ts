// Import necessary TypeScript Compiler API modules
import * as ts from 'typescript';
import * as fs from "fs";
import transformerFactory from 'quote-transformer';

console.log('Current Working Directory:', process.cwd());
const sourceFilePath = './examples/codeExamples.source.ts';
const transformedFilePath = './examples/codeExamples.transformed.ts';
if (!fs.existsSync(sourceFilePath))
  throw new Error("File not found:" + sourceFilePath);

// Create a program using the TypeScript Compiler API
const program = ts.createProgram([sourceFilePath], {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.CommonJS,
});

// Get the source file you want to transform
const sourceFile = program.getSourceFile(sourceFilePath);

var printer = ts.createPrinter();

console.log("SOURCE");
console.log(printer.printFile(sourceFile!));


console.log("TRANSFORMED")
var transformer = transformerFactory(program, undefined, {
  ts,
  addDiagnostic: (d: ts.Diagnostic) => {
    console.error(`${d.code} ${d.messageText} ${d.file?.fileName} ${d.start} (${d.length})`);
    return 0;
  }
} as any);

// Apply the transformer to the source file
const transformedSourceFile = ts.transform(sourceFile!, [transformer]).transformed[0];

// Print the transformed source file
const transformedCode = printer.printFile(transformedSourceFile);
console.log(transformedCode);
fs.writeFileSync(transformedFilePath, transformedCode, 'utf8');
console.log('Wrote transformed file to:', transformedFilePath);
