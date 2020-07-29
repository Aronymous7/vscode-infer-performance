import * as vscode from 'vscode';

export interface InferCostItem {
  id: string;           // `${full file path}:${method name}`
  method_name: string;
  timestamp?: string;   // used for cost history
  loc: {
    file: string;
    lnum: number;
  };
  alloc_cost: {
    polynomial: string;
    degree: number;
    big_o: string;
  };
  exec_cost: {
    polynomial: string;
    degree: number;
    big_o: string;
  };
}

export interface MethodDeclaration {
  name: string;
  declarationRange: vscode.Range;
  nameRange: vscode.Range;
}