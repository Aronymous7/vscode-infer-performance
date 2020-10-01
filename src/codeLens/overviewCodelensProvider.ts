import * as vscode from 'vscode';
import { isExtensionEnabled } from '../extension';
import { findMethodDeclarations } from '../javaCodeHandler';

export class OverviewCodelensProvider implements vscode.CodeLensProvider {
  private codeLenses: vscode.CodeLens[] = [];

  private document: vscode.TextDocument | undefined;

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
      let selectedMethodName = "";
      let selectedMethodParameters: string[] = [];
      methodDeclarations.some(methodDeclaration => {
        if (methodDeclaration.declarationRange.end.line === codeLens.range.end.line) {
          selectedMethodName = methodDeclaration.name;
          selectedMethodParameters = methodDeclaration.parameters;
          return true;
        }
      });
      codeLens.command = {
        title: `Overview`,
        command: "infer-for-vscode.overviewCodelensAction",
        arguments: [selectedMethodName, selectedMethodParameters]
      };
      return codeLens;
    }
    return null;
  }
}