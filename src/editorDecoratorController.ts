import * as vscode from 'vscode';
import { activeTextEditor, currentInferCost, inferCostHistories, setCurrentInferCost } from './inferController';
import { getMethodDeclarations, isExpensiveMethod } from './javaCodeHandler';
import { InferCostItem } from './types';

// [inferCostItem.id, decorationType]
let methodDeclarationDecorationTypes = new Map<string, vscode.TextEditorDecorationType>();

let methodNameDecorationType: vscode.TextEditorDecorationType;
let methodNameDecorationTypeExpensive: vscode.TextEditorDecorationType;

export let areNameDecorationTypesSet: boolean = false;

export function disposeDecorationTypes() {
  if (areNameDecorationTypesSet) {
    methodNameDecorationType.dispose();
    methodNameDecorationTypeExpensive.dispose();

    areNameDecorationTypesSet = false;
  }

  for (const decorationType of methodDeclarationDecorationTypes) {
    decorationType[1].dispose();
  }
  methodDeclarationDecorationTypes = new Map<string, vscode.TextEditorDecorationType>();
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

  const methodNameDecorations: vscode.DecorationOptions[] = [];
  const methodNameDecorationsExpensive: vscode.DecorationOptions[] = [];
  for (let inferCostItem of currentInferCost) {
    methodDeclarations.some(methodDeclaration => {
      if (inferCostItem.method_name === methodDeclaration.name) {
        const declarationDecoration = { range: methodDeclaration.declarationRange };
        const nameDecoration = { range: methodDeclaration.nameRange, hoverMessage: `Execution cost: ${inferCostItem.exec_cost.polynomial} ~~ ${inferCostItem.exec_cost.big_o}` };
        if (isExpensiveMethod(inferCostItem.method_name, currentInferCost)) {
          methodNameDecorationsExpensive.push(nameDecoration);
        } else {
          methodNameDecorations.push(nameDecoration);
        }

        const newMethodDeclarationDecorationType = significantCostChangeDecorationType(inferCostItem);
        const oldMethodDeclarationDecorationType = methodDeclarationDecorationTypes.get(inferCostItem.id);
        if (newMethodDeclarationDecorationType) {
          oldMethodDeclarationDecorationType?.dispose();
          methodDeclarationDecorationTypes.set(inferCostItem.id, newMethodDeclarationDecorationType);
          activeTextEditor.setDecorations(newMethodDeclarationDecorationType, new Array(declarationDecoration));
        } else if (oldMethodDeclarationDecorationType) {
          activeTextEditor.setDecorations(oldMethodDeclarationDecorationType, new Array(declarationDecoration));
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
  if (currentInferCostItem.exec_cost.degree !== previousInferCostItem.exec_cost.degree) {
    let costChangeColor = '#00ff00';
    if (currentInferCostItem.exec_cost.degree > previousInferCostItem.exec_cost.degree) {
      costChangeColor = '#ff0000';
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