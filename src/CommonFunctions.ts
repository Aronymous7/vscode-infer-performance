import * as vscode from 'vscode';
import { InferCostItem, MethodDeclaration } from './CustomTypes';


export function getMethodDeclarations(document: vscode.TextDocument) {
  const regex = new RegExp(/(?:public|protected|private|static|\s) +(?:[\w\<\>\[\]]+)\s+(\w+) *\([^\)]*\) *(?:\{?|[^;])/g);
  const text = document.getText();
  let methodDeclarations: MethodDeclaration[] = [];
  let matches;
  while ((matches = regex.exec(text)) !== null) {
    const line = document.lineAt(document.positionAt(matches.index).line);
    const indexOf = line.text.indexOf(matches[1]);
    const startPosition = new vscode.Position(line.lineNumber, indexOf);
    const endPosition = new vscode.Position(line.lineNumber, indexOf + matches[1].length);
    const range = new vscode.Range(startPosition, endPosition);
    if (range) {
      methodDeclarations.push({ name: matches[1], range: range });
    }
  }
  return methodDeclarations;
}