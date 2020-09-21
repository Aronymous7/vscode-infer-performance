import * as vscode from 'vscode';
import { InferCostItem, MethodDeclaration } from '../types';
import { isExtensionEnabled } from '../extension';
import {
  findMethodDeclarations,
  significantlyChangedMethods,
  onSignificantCodeChange
} from '../javaCodeHandler';
import { currentInferCost, activeTextEditor } from '../inferController';

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
      let thisMethodDeclaration: MethodDeclaration | undefined;
      methodDeclarations.some(methodDeclaration => {
        if (methodDeclaration.declarationRange.end.line === codeLens.range.end.line) {
          thisMethodDeclaration = methodDeclaration;
          return true;
        }
      });
      if (!thisMethodDeclaration) {
        codeLens.command = {
          title: "No performance data available for this method.",
          command: "infer-for-vscode.detailCodelensError"
        };
        return codeLens;
      }
      let occurenceIndex = 0;
      for (const methodDeclaration of methodDeclarations) {
        if (methodDeclaration.declarationRange.end.line === codeLens.range.end.line) {
          break;
        } else if (thisMethodDeclaration.name === methodDeclaration.name) {
          occurenceIndex++;
        }
      }
      let currentInferCostItem: InferCostItem | undefined;
      let tempOccurenceIndex = occurenceIndex;
      for (let inferCostItem of this.inferCost) {
        if (inferCostItem.method_name === thisMethodDeclaration.name) {
          if (tempOccurenceIndex === 0) {
            currentInferCostItem = inferCostItem;
            break;
          }
          tempOccurenceIndex--;
        }
      }
      if (!currentInferCostItem) {
        codeLens.command = {
          title: "No performance data available for this method.",
          command: "infer-for-vscode.detailCodelensError"
        };
        return codeLens;
      }
      let isSignificantlyChangedMethod = false;
      const fileSignificantlyChangedMethods = significantlyChangedMethods.get(this.document.fileName);
      if (fileSignificantlyChangedMethods) {
        for (const containingMethod of fileSignificantlyChangedMethods) {
          if (containingMethod[0] === `${currentInferCostItem.method_name}:${occurenceIndex}`) {
            isSignificantlyChangedMethod = true;
            break;
          }
        }
      }
      codeLens.command = {
        title: `Execution cost${isSignificantlyChangedMethod ? " (might have changed!)" : ""}: ${currentInferCostItem.exec_cost.polynomial} ~~ ${currentInferCostItem.exec_cost.big_o}`,
        command: "infer-for-vscode.detailCodelensAction",
        arguments: [currentInferCostItem.id]
      };
      return codeLens;
    }
    return null;
  }
}