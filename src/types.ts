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

// The cost data for one function as given by Infer. Also used for history entries.
export interface InferCostItem {
  readonly id: string;
  readonly method_name: string;
  readonly parameterTypes: string[];
  timestamp?: string;       // timestamp for cost history
  readonly loc: {
    readonly file: string;  // absolute path
    readonly lnum: number;
  };
  readonly exec_cost: {
    readonly polynomial: string;
    readonly degree: number;
    readonly big_o: string;
  };
  changeCauseMethods?: string[];  // method calls that might lead or potentially have led (history) to significant change in cost of this function
  readonly trace: TraceItem[];
}

// An item of the trace for the execution cost shown in the detail view of a function, as provided by Infer.
export interface TraceItem {
  readonly level: number;
  readonly filename: string;
  readonly line_number: number;
  readonly description: string;
}

// Used for matching the output from Infer with the functions in the source code, and insert the CodeLenses above them.
export interface MethodDeclaration {
  readonly name: string;
  readonly parameterTypes: string[];
  readonly declarationRange: vscode.Range;
  readonly nameRange: vscode.Range;
}

// Object structure used by the 'diff' library.
export interface LineDiff {
  readonly count: number;
  readonly added?: boolean;
  readonly removed?: boolean;
  readonly value: string;
}