import * as vscode from 'vscode';
import { activeTextEditor, currentInferCost, inferCostHistories, setCurrentInferCost } from './inferController';
import { getMethodDeclarations, isExpensiveMethod } from './javaCodeHandler';
import { InferCostItem } from './types';

// [document.fileName, [methodName, decorationType]]
let methodDeclarationDecorationTypes = new Map<string, Map<string, vscode.TextEditorDecorationType>>();

let methodNameDecorationType: vscode.TextEditorDecorationType;
let methodNameDecorationTypeExpensive: vscode.TextEditorDecorationType;

export let areNameDecorationTypesSet: boolean = false;

export function disposeDecorationTypes() {
  if (areNameDecorationTypesSet) {
    methodNameDecorationType.dispose();
    methodNameDecorationTypeExpensive.dispose();

    areNameDecorationTypesSet = false;
  }

  for (const decorationTypeMap of methodDeclarationDecorationTypes) {
    for (const decorationType of decorationTypeMap[1]) {
      decorationType[1].dispose();
    }
  }
}

export function initializeNameDecorationTypes() {
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

  areNameDecorationTypesSet = true;
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
        if (isExpensiveMethod(inferCostItem.method_name, currentInferCost)) {
          methodNameDecorationsExpensive.push(nameDecoration);
        } else {
          methodNameDecorations.push(nameDecoration);
        }
        let methodDeclarationDecorationType = significantCostChangeDecorationType(inferCostItem);
        if (methodDeclarationDecorationType) {
          let currentDecorationTypes = methodDeclarationDecorationTypes.get(activeTextEditor.document.fileName);
          if (!currentDecorationTypes) {
            currentDecorationTypes = methodDeclarationDecorationTypes.
                set(activeTextEditor.document.fileName, new Map<string, vscode.TextEditorDecorationType>()).
                get(activeTextEditor.document.fileName);
          }
          if (currentDecorationTypes) {
            currentDecorationTypes.set(inferCostItem.method_name, methodDeclarationDecorationType);
            activeTextEditor.setDecorations(methodDeclarationDecorationType, new Array(declarationDecoration));
          }
        } else {
          methodDeclarationDecorationType = methodDeclarationDecorationTypes.get(activeTextEditor.document.fileName)?.
                                                                             get(inferCostItem.method_name);
          if (methodDeclarationDecorationType) {
            activeTextEditor.setDecorations(methodDeclarationDecorationType, new Array(declarationDecoration));
          }
        }
        return true;
      }
    });
  }
  activeTextEditor.setDecorations(methodNameDecorationType, methodNameDecorations);
  activeTextEditor.setDecorations(methodNameDecorationTypeExpensive, methodNameDecorationsExpensive);
}

function significantCostChangeDecorationType(currentInferCostItem: InferCostItem) {
  const inferCostItemHistory = inferCostHistories.get(currentInferCostItem.id);
  if (!inferCostItemHistory || inferCostItemHistory.length < 2) { return undefined; }

  const previousInferCostItem = inferCostItemHistory[1];
  if (currentInferCostItem.exec_cost.big_o !== previousInferCostItem.exec_cost.big_o) {
    let costChangeColor = '#ff0000';
    if (currentInferCostItem.exec_cost.degree < previousInferCostItem.exec_cost.degree) {
      costChangeColor = '#00ff00';
    }
    return vscode.window.createTextEditorDecorationType({
      after: {
        contentText: ` ${previousInferCostItem.exec_cost.big_o} -> ${currentInferCostItem.exec_cost.big_o}`,
        color: costChangeColor
      }
    });
  } else {
    return undefined;
  }
}