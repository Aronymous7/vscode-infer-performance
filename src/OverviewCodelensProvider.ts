import * as vscode from 'vscode';
import { getMethodDeclarations } from './CommonFunctions';

export class OverviewCodelensProvider implements vscode.CodeLensProvider {
  private codeLenses: vscode.CodeLens[] = [];
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  constructor() {
    vscode.workspace.onDidChangeConfiguration((_) => {
      this._onDidChangeCodeLenses.fire();
    });
  }

  public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
    if (vscode.workspace.getConfiguration("infer-for-vscode").get("enableInfer", false)) {
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
      codeLens.command = {
        title: `Overview`,
        tooltip: "Tooltip provided by Infer for VSCode extension",
        command: "infer-for-vscode.codelensOverviewAction"
      };
      return codeLens;
    }
    return null;
  }
}