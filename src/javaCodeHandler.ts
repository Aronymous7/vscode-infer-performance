import * as vscode from 'vscode';
import { METHOD_DECLARATION_REGEX, SIGNIFICANT_CODE_CHANGE_REGEX } from './constants';
import { InferCostItem, MethodDeclaration, LineDiff } from './types';
import { activeTextEditor, activeTextEditorTexts } from './inferController';

const Diff = require('diff');

export function getMethodDeclarations(document: vscode.TextDocument) {
  const regex = new RegExp(METHOD_DECLARATION_REGEX);
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

export function isSignificantCodeChange(savedText: string) {
  const previousText = activeTextEditorTexts.get(activeTextEditor.document.fileName);
  if (!previousText) { return false; }

  const diffText: LineDiff[] = Diff.diffLines(previousText, savedText);
  for (let diffTextPart of diffText) {
    if (diffTextPart.hasOwnProperty('added') || diffTextPart.hasOwnProperty('removed')) {
      if (diffTextPart.value.match(SIGNIFICANT_CODE_CHANGE_REGEX)) {
        return true;
      }
    }
  }
  return false;
}