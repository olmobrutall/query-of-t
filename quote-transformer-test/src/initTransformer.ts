// Import necessary TypeScript Compiler API modules
import * as ts from 'typescript';
import * as fs from "fs";
import transformerFactory from 'quote-transformer/lib/transformerFactory';

console.log('Current Working Directory:', process.cwd());

const fileToConvert = './examples/codeExamples.before.ts';
if (!fs.existsSync(fileToConvert))
  throw new Error("File not found:" + fileToConvert);

// Create a program using the TypeScript Compiler API
const program = ts.createProgram([fileToConvert], {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.CommonJS,
});

// Get the source file you want to transform
const sourceFile = program.getSourceFile(fileToConvert);

var printer = ts.createPrinter();

console.log("BEFORE");
console.log(printer.printFile(sourceFile!));


console.log("AFTER")
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
console.log(printer.printFile(transformedSourceFile));
