import * as vscode from 'vscode';
import { InferCostItem, MethodDeclaration } from './CustomTypes';
import { getMethodDeclarations } from './CommonFunctions';

export class CodelensProvider implements vscode.CodeLensProvider {
  private codeLenses: vscode.CodeLens[] = [];
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  private document: vscode.TextDocument | undefined;
  private inferCost: InferCostItem[];

  constructor(inferCost: InferCostItem[]) {
    vscode.workspace.onDidChangeConfiguration((_) => {
      this._onDidChangeCodeLenses.fire();
    });

    this.inferCost = inferCost;
  }

  public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
    if (vscode.workspace.getConfiguration("infer-for-vscode").get("enableInfer", false)) {
      this.document = document;
      const methodDeclarations = getMethodDeclarations(document);
      this.codeLenses = [];
      methodDeclarations.forEach(methodDeclaration => {
        this.codeLenses.push(new vscode.CodeLens(methodDeclaration.declarationRange));
      });
      return this.codeLenses;
    }
    return [];
  }

  public resolveCodeLens(codeLens: vscode.CodeLens, token: vscode.CancellationToken) {
    if (vscode.workspace.getConfiguration("infer-for-vscode").get("enableInfer", false)) {
      if (!this.document) { return; }
      const methodDeclarations = getMethodDeclarations(this.document);
      let methodName = "";
      methodDeclarations.some(methodDeclaration => {
        if (methodDeclaration.declarationRange.end.line === codeLens.range.end.line) {
          methodName = methodDeclaration.name;
          return true;
        }
      });
      let currentInferCostItem: InferCostItem | undefined;
      for (let inferCostItem of this.inferCost) {
        if (inferCostItem.procedure_name === methodName) {
          currentInferCostItem = inferCostItem;
          break;
        }
      }
      if (!currentInferCostItem) {
        console.log(`Method with name '${methodName}' could not be found in InferCost array.`);
        return;
      }
      codeLens.command = {
        title: `Execution cost: ${currentInferCostItem.exec_cost.hum.hum_polynomial} (Big-O: ${currentInferCostItem.exec_cost.hum.big_o})`,
        tooltip: "Tooltip provided by Infer for VSCode extension",
        command: "infer-for-vscode.codelensAction",
        arguments: [currentInferCostItem]
      };
      return codeLens;
    }
    return null;
  }
}