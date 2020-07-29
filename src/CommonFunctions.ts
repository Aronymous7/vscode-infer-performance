import * as vscode from 'vscode';
import { InferCostItem, MethodDeclaration } from './CustomTypes';

export function getMethodDeclarations(document: vscode.TextDocument) {
  const regex = new RegExp(/(?:public|protected|private|static|\s) +(?:[\w\<\>\[\]]+)\s+(\w+) *\([^\)]*\) *(?:\{?|[^;])/g);
  const text = document.getText();
  let methodDeclarations: MethodDeclaration[] = [];
  let matches;
  while ((matches = regex.exec(text)) !== null) {
    const line = document.lineAt(document.positionAt(matches.index).line);

    const declarationIndexOf = line.text.indexOf(matches[0]);
    const declarationStartPosition = new vscode.Position(line.lineNumber, declarationIndexOf);
    const declarationEndPosition = new vscode.Position(line.lineNumber, declarationIndexOf + matches[0].length);
    const declarationRange = new vscode.Range(declarationStartPosition, declarationEndPosition);

    const nameIndexOf = line.text.indexOf(matches[1]);
    const nameStartPosition = new vscode.Position(line.lineNumber, nameIndexOf);
    const nameEndPosition = new vscode.Position(line.lineNumber, nameIndexOf + matches[1].length);
    const nameRange = new vscode.Range(nameStartPosition, nameEndPosition);
    if (declarationRange && nameRange) {
      methodDeclarations.push({ name: matches[1], declarationRange: declarationRange, nameRange: nameRange });
    }
  }
  return methodDeclarations;
}

export function isExpensiveMethod(methodName: string, inferCost: InferCostItem[] | undefined) {
  if (inferCost === undefined) { return false; }

  let mostExpensiveConstantMethod = {
    name: '',
    executionCost: 0
  };
  for (let inferCostItem of inferCost) {
    if (+inferCostItem.exec_cost.degree === 0 && +inferCostItem.exec_cost.polynomial > mostExpensiveConstantMethod.executionCost) {
      mostExpensiveConstantMethod = {
        name: inferCostItem.method_name,
        executionCost: +inferCostItem.exec_cost.polynomial
      };
    }
  }
  if (methodName === mostExpensiveConstantMethod.name) {
    return true;
  } else {
    return false;
  }
}