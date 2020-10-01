import * as vscode from 'vscode';
import { activeTextEditor, currentInferCost, inferCostHistories } from './inferController';
import { findMethodDeclarations } from './javaCodeHandler';
import { InferCostItem } from './types';

// [inferCostItem.id, decorationType]
let costChangeDecorationTypes = new Map<string, vscode.TextEditorDecorationType>();

const costDegreeDecorationTypesLength = 3;
export let costDegreeDecorationTypes: vscode.TextEditorDecorationType[] = [];

export function disposeDecorationTypes() {
  for (const decorationType of costDegreeDecorationTypes) {
    decorationType.dispose();
  }
  costDegreeDecorationTypes = [];

  for (const decorationType of costChangeDecorationTypes) {
    decorationType[1].dispose();
  }
  costChangeDecorationTypes = new Map<string, vscode.TextEditorDecorationType>();
}

export function initializeNameDecorationTypes() {
  costDegreeDecorationTypes.push(vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(0, 255, 0, 0.4)',
    overviewRulerColor: 'rgba(0, 255, 0, 1)',
    overviewRulerLane: vscode.OverviewRulerLane.Right,
  }));
  costDegreeDecorationTypes.push(vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(255, 255, 0, 0.4)',
    overviewRulerColor: 'rgba(255, 255, 0, 1)',
    overviewRulerLane: vscode.OverviewRulerLane.Right,
  }));
  costDegreeDecorationTypes.push(vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(255, 0, 0, 0.4)',
    overviewRulerColor: 'rgba(255, 0, 0, 1)',
    overviewRulerLane: vscode.OverviewRulerLane.Right,
  }));
}

export function createEditorDecorators() {
  const methodDeclarations = findMethodDeclarations(activeTextEditor.document);

  const costDegreeDecorations: vscode.DecorationOptions[][] = [];
  for (let i = 0; i < costDegreeDecorationTypesLength; i++) {
    costDegreeDecorations.push([]);
  }
  for (let inferCostItem of currentInferCost) {
    for (const methodDeclaration of methodDeclarations) {
      if (inferCostItem.method_name === methodDeclaration.name && JSON.stringify(inferCostItem.parameters) === JSON.stringify(methodDeclaration.parameters)) {
        const declarationDecoration = { range: methodDeclaration.declarationRange };
        const nameDecoration = { range: methodDeclaration.nameRange, hoverMessage: `Execution cost: ${inferCostItem.exec_cost.polynomial} ~~ ${inferCostItem.exec_cost.big_o}` };

        if (inferCostItem.exec_cost.degree !== -1) {
          const costDegreeIndex = ((inferCostItem.exec_cost.degree !== null) && (inferCostItem.exec_cost.degree < costDegreeDecorationTypesLength)) ?
              inferCostItem.exec_cost.degree :
              costDegreeDecorationTypesLength - 1;

          costDegreeDecorations[costDegreeIndex].push(nameDecoration);
        }

        const newCostChangeDecorationType = significantCostChangeDecorationType(inferCostItem);
        const oldCostChangeDecorationType = costChangeDecorationTypes.get(inferCostItem.id);
        if (newCostChangeDecorationType) {
          oldCostChangeDecorationType?.dispose();
          costChangeDecorationTypes.set(inferCostItem.id, newCostChangeDecorationType);
          activeTextEditor.setDecorations(newCostChangeDecorationType, new Array(declarationDecoration));
        } else if (oldCostChangeDecorationType) {
          activeTextEditor.setDecorations(oldCostChangeDecorationType, new Array(declarationDecoration));
        }

        break;
      }
    }
  }
  for (let i = 0; i < costDegreeDecorationTypesLength; i++) {
    activeTextEditor.setDecorations(costDegreeDecorationTypes[i], costDegreeDecorations[i]);
  }
}

function significantCostChangeDecorationType(currentInferCostItem: InferCostItem) {
  const inferCostItemHistory = inferCostHistories.get(currentInferCostItem.id);
  if (!inferCostItemHistory || inferCostItemHistory.length < 2) { return undefined; }

  const previousInferCostItem = inferCostItemHistory[1];
  if (currentInferCostItem.exec_cost.big_o !== previousInferCostItem.exec_cost.big_o) {
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