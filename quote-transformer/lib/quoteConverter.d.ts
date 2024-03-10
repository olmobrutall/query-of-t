import type * as ts2 from 'typescript';
export declare class QuoteError {
    node: ts2.Node;
    message: string;
    constructor(node: ts2.Node, message: string);
}
export declare function getQuoteConverter(tsInstance: typeof ts2): (node: ts2.Expression, idents: string[], initialThis?: boolean) => ts2.Expression | QuoteError;
