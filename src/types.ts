import * as vscode from 'vscode';

export interface InferCostItem {
  readonly id: string;    // `${individual file name}:${method name}`
  readonly method_name: string;
  timestamp?: string;     // used for cost history
  readonly loc: {
    readonly file: string;
    readonly lnum: number;
  };
  readonly alloc_cost: {
    readonly polynomial: string;
    readonly degree: number;
    readonly big_o: string;
  };
  readonly exec_cost: {
    readonly polynomial: string;
    readonly degree: number;
    readonly big_o: string;
  };
}

export interface MethodDeclaration {
  readonly name: string;
  readonly declarationRange: vscode.Range;
  readonly nameRange: vscode.Range;
}

export interface LineDiff {
  readonly count: number;
  readonly added?: boolean;
  readonly removed?: boolean;
  readonly value: string;
}