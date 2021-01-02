import * as vscode from 'vscode';
import { isExtensionEnabled } from '../extension';
import { findMethodDeclarations } from '../javaCodeHandler';

// CodeLenses for opening the overview of the functions of a file.
export class OverviewCodelensProvider implements vscode.CodeLensProvider {
  private codeLenses: vscode.CodeLens[] = [];

  private document: vscode.TextDocument | undefined;

  // Initialize the CodeLenses, including their positions, for all functions of a file.
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

  // Assign the title and command when clicked to a CodeLens.
  public resolveCodeLens(codeLens: vscode.CodeLens, token: vscode.CancellationToken) {
    if (isExtensionEnabled) {
      if (!this.document) { return; }
      const methodDeclarations = findMethodDeclarations(this.document);
      let selectedMethodName = "";
      let selectedMethodParameters: string[] = [];
      methodDeclarations.some(methodDeclaration => {
        if (methodDeclaration.declarationRange.end.line === codeLens.range.end.line) {
          selectedMethodName = methodDeclaration.name;
          selectedMethodParameters = methodDeclaration.parameterTypes;
          return true;
        }
      });
      codeLens.command = {
        title: `Overview`,
        command: "performance-by-infer.overviewCodelensAction",
        arguments: [selectedMethodName, selectedMethodParameters]
      };
      return codeLens;
    }
    return null;
  }
}