import * as vscode from 'vscode';
import { activeTextEditor, currentInferCost } from './inferController';
import { getMethodDeclarations, isExpensiveMethod } from './javaCodeHandler';

// Decorator types that we use to decorate method declarations
let methodDeclarationDecorationType: vscode.TextEditorDecorationType;
let methodNameDecorationType: vscode.TextEditorDecorationType;
let methodNameDecorationTypeExpensive: vscode.TextEditorDecorationType;

export let areDecorationTypesSet: boolean = false;

export function disposeDecorationTypes() {
  if (areDecorationTypesSet) {
    methodDeclarationDecorationType.dispose();
    methodNameDecorationType.dispose();
    methodNameDecorationTypeExpensive.dispose();

    areDecorationTypesSet = false;
  }
}

export function initializeDecorationTypes() {
  methodDeclarationDecorationType = vscode.window.createTextEditorDecorationType({
    after: {
      contentText: ' (warn about significant changes here)',
      color: '#ff0000'
    }
  });
  methodNameDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(150, 255, 10, 0.5)',
    overviewRulerColor: 'rgba(150, 250, 50, 1)',
    overviewRulerLane: vscode.OverviewRulerLane.Right,
  });
  methodNameDecorationTypeExpensive = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(255, 0, 0, 0.7)',
    overviewRulerColor: '#ff0000',
    overviewRulerLane: vscode.OverviewRulerLane.Right,
  });

  areDecorationTypesSet = true;
}

export function createEditorDecorators() {
  const methodDeclarations = getMethodDeclarations(activeTextEditor.document);

  const methodDeclarationDecorations: vscode.DecorationOptions[] = [];
  const methodNameDecorations: vscode.DecorationOptions[] = [];
  const methodNameDecorationsExpensive: vscode.DecorationOptions[] = [];
  for (let inferCostItem of currentInferCost) {
    methodDeclarations.some(methodDeclaration => {
      if (inferCostItem.method_name === methodDeclaration.name) {
        const declarationDecoration = { range: methodDeclaration.declarationRange };
        const nameDecoration = { range: methodDeclaration.nameRange, hoverMessage: `Execution cost: ${inferCostItem.exec_cost.polynomial} -- ${inferCostItem.exec_cost.big_o}` };
        methodDeclarationDecorations.push(declarationDecoration);
        if (isExpensiveMethod(inferCostItem.method_name, currentInferCost)) {
          methodNameDecorationsExpensive.push(nameDecoration);
        } else {
          methodNameDecorations.push(nameDecoration);
        }
        return true;
      }
    });
  }
  activeTextEditor.setDecorations(methodDeclarationDecorationType, methodDeclarationDecorations);
  activeTextEditor.setDecorations(methodNameDecorationType, methodNameDecorations);
  activeTextEditor.setDecorations(methodNameDecorationTypeExpensive, methodNameDecorationsExpensive);
}
