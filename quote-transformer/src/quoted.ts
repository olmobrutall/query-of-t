
export type Quoted<T extends Function> = T | ExLambda;

export type QuotedEx =
    ExConstant |
    ExUnary |
    ExBinary |
    ExConditional |
    ExProperty |
    ExCall |
    ExParam |
    ExLambda |
    ExObject |
    ExNew;


export type ExConstant = ["c", unknown];
export type ExUnary = [OpUnary, QuotedEx];
export type ExBinary = [OpBinary, QuotedEx, QuotedEx];
export type ExConditional = ["?:", QuotedEx, QuotedEx, QuotedEx];
export type ExProperty = ["." | "?.", QuotedEx, string];
export type ExCall = ["()" | "?.()", QuotedEx, QuotedEx[]];
export type ExParam = ["p", string];
export type ExLambda = ["=>", ExParam[], QuotedEx]
export type ExObject = ["{}", { [name: string]: QuotedEx }];
export type ExNew = ["new", Function, QuotedEx[]];
export type ExQuote = ["q", QuotedEx];

export type OpUnary = "+u" | "-u" | "~" | "!";
export type OpBinary =
    "**" |
    "*" | "/" | "%" |
    "+" | "-" |
    "<<" | ">>" | ">>>" |
    "<" | "<=" | ">" | ">=" | "instanceof" |
    "==" | "!=" | "===" | "!==" |
    "&" | "|" | "^" |
    "&&" | "||" |
    "??";
