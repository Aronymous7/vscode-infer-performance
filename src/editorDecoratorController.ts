import * as vscode from 'vscode';
import { activeTextEditor, currentInferCost, inferCostHistories } from './inferController';
import { findMethodDeclarations } from './javaCodeHandler';
import { InferCostItem } from './types';

// [inferCostItem.id, decorationType]
let costChangeDecorationTypes = new Map<string, vscode.TextEditorDecorationType>();

// Number of different decoration types for different degrees of cost, in this case three: constant,
// linear, and quadratic or above.
const costDegreeDecorationTypesLength = 3;

export let costDegreeDecorationTypes: vscode.TextEditorDecorationType[] = [];

// Dispose the used decoration types, which removes all created editor decorations.
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

// Initialize the decoration types for function names (green, yellow and red for constant, linear
// and quadratic or above respectively).
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

// Create the editor decorations for all functions in the current file. This includes coloring the
// function names, and potentially inserting the change in cost since the last analysis by Infer if
// it has changed significantly.
export function createEditorDecorators() {
  const methodDeclarations = findMethodDeclarations(activeTextEditor.document);

  const costDegreeDecorations: vscode.DecorationOptions[][] = [];
  for (let i = 0; i < costDegreeDecorationTypesLength; i++) {
    costDegreeDecorations.push([]);
  }
  for (let inferCostItem of currentInferCost) {
    for (const methodDeclaration of methodDeclarations) {
      if (inferCostItem.method_name === methodDeclaration.name && JSON.stringify(inferCostItem.parameterTypes) === JSON.stringify(methodDeclaration.parameterTypes)) {
        const declarationDecoration = { range: methodDeclaration.declarationRange };
        const nameDecoration = { range: methodDeclaration.nameRange, hoverMessage: inferCostItem.exec_cost.polynomial };

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

// Creates the decoration type that inserts the change in cost after the function parameters when
// the cost of the function has changed significantly.
function significantCostChangeDecorationType(currentInferCostItem: InferCostItem) {
  const inferCostItemHistory = inferCostHistories.get(currentInferCostItem.id);
  if (!inferCostItemHistory || inferCostItemHistory.length < 2) { return undefined; }

  const previousInferCostItem = inferCostItemHistory[1];
  if (currentInferCostItem.exec_cost.big_o !== previousInferCostItem.exec_cost.big_o) {
    let costChangeColor = '#00aa00';
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