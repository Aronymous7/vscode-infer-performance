import * as vscode from 'vscode';
import { InferCostItem, MethodDeclaration } from './CustomTypes';

export class CodelensProvider implements vscode.CodeLensProvider {
  private codeLenses: vscode.CodeLens[] = [];
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  private inferCost: InferCostItem[];

  constructor(inferCost: InferCostItem[]) {
    vscode.workspace.onDidChangeConfiguration((_) => {
      this._onDidChangeCodeLenses.fire();
    });

    this.inferCost = inferCost;
  }

  public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
    if (vscode.workspace.getConfiguration("infer-for-vscode").get("enableCodeLens", true)) {
      const methodDeclarations = this.getMethodDeclarations(document);
      this.codeLenses = [];
      methodDeclarations.forEach(methodDeclaration => {
        this.codeLenses.push(new vscode.CodeLens(methodDeclaration.range));
      });
      return this.codeLenses;
    }
    return [];
  }

  public resolveCodeLens(codeLens: vscode.CodeLens, token: vscode.CancellationToken) {
    if (vscode.workspace.getConfiguration("infer-for-vscode").get("enableCodeLens", true)) {
      const document = vscode.window.activeTextEditor?.document;
      if (!document) { return; }
      const methodDeclarations = this.getMethodDeclarations(document);
      let methodName = "";
      methodDeclarations.some(methodDeclaration => {
        if (methodDeclaration.range.end.line === codeLens.range.end.line) {
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
      if (currentInferCostItem === undefined) {
        console.log(`Method with name '${methodName}' could not be found in InferCost array.`);
        return;
      }
      codeLens.command = {
        title: `Execution cost: ${currentInferCostItem.exec_cost.hum.hum_polynomial} (Big-O: ${currentInferCostItem.exec_cost.hum.big_o})`,
        tooltip: "Tooltip provided by Infer for VSCode extension",
        command: "infer-for-vscode.codelensAction",
        arguments: ["Argument 1", false]
      };
      return codeLens;
    }
    return null;
  }

  private getMethodDeclarations(document: vscode.TextDocument) {
    const regex = new RegExp(/(?:public|protected|private|static|\s) +(?:[\w\<\>\[\]]+)\s+(\w+) *\([^\)]*\) *(?:\{?|[^;])/g);
    const text = document.getText();
    let methodDeclarations: MethodDeclaration[] = [];
    let matches;
    while ((matches = regex.exec(text)) !== null) {
      const line = document.lineAt(document.positionAt(matches.index).line);
      const indexOf = line.text.indexOf(matches[0]);
      const position = new vscode.Position(line.lineNumber, indexOf);
      const range = document.getWordRangeAtPosition(position, new RegExp(regex));
      if (range) {
        methodDeclarations.push({ name: matches[1], range: range });
      }
    }
    return methodDeclarations;
  }
}