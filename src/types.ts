import * as vscode from 'vscode';

export enum ExecutionMode {
  Project,
  File
}

export enum EnableMode {
  LoadRecentData,
  ReadInferOut,
  FreshExecution
}

export interface InferCostItem {
  readonly id: string;
  readonly method_name: string;
  readonly parameters: string[];
  timestamp?: string;       // used for cost history
  readonly loc: {
    readonly file: string;  // absolute path
    readonly lnum: number;
  };
  readonly exec_cost: {
    readonly polynomial: string;
    readonly degree: number;
    readonly big_o: string;
  };
  changeCauseMethods?: string[];
  readonly trace: TraceItem[];
}

export interface TraceItem {
  readonly level: number;
  readonly filename: string;
  readonly line_number: number;
  readonly description: string;
}

export interface MethodDeclaration {
  readonly name: string;
  readonly parameters: string[];
  readonly declarationRange: vscode.Range;
  readonly nameRange: vscode.Range;
}

export interface LineDiff {
  readonly count: number;
  readonly added?: boolean;
  readonly removed?: boolean;
  readonly value: string;
}