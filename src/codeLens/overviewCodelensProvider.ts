import * as vscode from 'vscode';
import { getMethodDeclarations } from '../javaCodeHandler';

export class OverviewCodelensProvider implements vscode.CodeLensProvider {
  private codeLenses: vscode.CodeLens[] = [];
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  private document: vscode.TextDocument | undefined;

  constructor() {
    vscode.workspace.onDidChangeConfiguration((_) => {
      this._onDidChangeCodeLenses.fire();
    });
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
      let selectedMethodName = "";
      methodDeclarations.some(methodDeclaration => {
        if (methodDeclaration.declarationRange.end.line === codeLens.range.end.line) {
          selectedMethodName = methodDeclaration.name;
          return true;
        }
      });
      codeLens.command = {
        title: `Overview`,
        command: "infer-for-vscode.overviewCodelensAction",
        arguments: [selectedMethodName]
      };
      return codeLens;
    }
    return null;
  }
}