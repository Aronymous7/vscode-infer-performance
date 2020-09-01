import * as vscode from 'vscode';
import { InferCostItem } from '../types';
import { isExtensionEnabled } from '../extension';
import {
  findMethodDeclarations,
  significantlyChangedMethods,
  onSignificantCodeChange
} from '../javaCodeHandler';

export class DetailCodelensProvider implements vscode.CodeLensProvider {
  private codeLenses: vscode.CodeLens[] = [];

  private document: vscode.TextDocument | undefined;
  private inferCost: InferCostItem[];
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  constructor(inferCost: InferCostItem[]) {
    onSignificantCodeChange(() => {
      this._onDidChangeCodeLenses.fire();
    });

    this.inferCost = inferCost;
  }

  public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
    if (isExtensionEnabled) {
      this.document = document;
      const methodDeclarations = findMethodDeclarations(this.document);
      this.codeLenses = [];
      methodDeclarations.forEach(methodDeclaration => {
        this.codeLenses.push(new vscode.CodeLens(methodDeclaration.declarationRange));
      });
      return this.codeLenses;
    }
    return [];
  }

  public resolveCodeLens(codeLens: vscode.CodeLens, token: vscode.CancellationToken) {
    if (isExtensionEnabled) {
      if (!this.document) { return; }
      const methodDeclarations = findMethodDeclarations(this.document);
      let methodName = "";
      methodDeclarations.some(methodDeclaration => {
        if (methodDeclaration.declarationRange.end.line === codeLens.range.end.line) {
          methodName = methodDeclaration.name;
          return true;
        }
      });
      let currentInferCostItem: InferCostItem | undefined;
      for (let inferCostItem of this.inferCost) {
        if (inferCostItem.method_name === methodName) {
          currentInferCostItem = inferCostItem;
          break;
        }
      }
      if (!currentInferCostItem) {
        codeLens.command = {
          title: "Method signature has changed, please save the file and re-execute Infer.",
          command: "infer-for-vscode.detailCodelensError"
        };
        return codeLens;
      }
      codeLens.command = {
        title: `Execution cost${significantlyChangedMethods.includes(currentInferCostItem.method_name) ? " (might have changed!)" : ""}: ${currentInferCostItem.exec_cost.polynomial} ~~ ${currentInferCostItem.exec_cost.big_o}`,
        command: "infer-for-vscode.detailCodelensAction",
        arguments: [currentInferCostItem.id]
      };
      return codeLens;
    }
    return null;
  }
}