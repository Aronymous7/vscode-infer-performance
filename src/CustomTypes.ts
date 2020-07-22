import * as vscode from 'vscode';

export interface InferCostItem {
  hash: string;
  loc: {
    file: string;
    lnum: number;
    cnum: number;
    enum: number;
  };
  procedure_name: string;
  procedure_id: string;
  alloc_cost: {
    polynomial: string;
    hum: {
      hum_polynomial: string;
      hum_degree: number;
      big_o: string;
    };
  };
  exec_cost: {
    polynomial: string;
    hum: {
      hum_polynomial: string;
      hum_degree: number;
      big_o: string;
    };
  };
}

export interface MethodDeclaration {
  name: string;
  range: vscode.Range;
}