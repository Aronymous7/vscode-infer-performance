import * as vscode from 'vscode';
import { InferCostItem, MethodDeclaration, LineDiff } from './types';
import { activeTextEditor, activeTextEditorTexts } from './inferController';

const Diff = require('diff');

const methodDeclarationRegex = new RegExp(/^(?:public|protected|private|static|final|native|synchronized|abstract|transient|\t| )+[\w\<\>\[\]]+\s+([A-Za-z_$][A-Za-z0-9_]*)(?<!if|switch|while|for)\([^\)]*\) *(?:\{(?:.*\})?|;)?/gm);
let significantCodeChangeRegex: RegExp;

function updateSignificantCodeChangeRegex() {
  const methodWhitelist: Array<string> = vscode.workspace.getConfiguration("infer-for-vscode").get("methodWhitelist", []);
  let methodWhitelistString = '';
  if (methodWhitelist.length !== 0) {
    methodWhitelistString = '|' + methodWhitelist.join('|');
  }
  significantCodeChangeRegex = new RegExp(`(while *\\(.+\\)|for *\\(.+\\)|[A-Za-z_$][A-Za-z0-9_]+(?<!\\W+(if|switch${methodWhitelistString}))\\(.*\\))`, 'g');
}

export function getMethodDeclarations(document: vscode.TextDocument) {
  const regex = new RegExp(methodDeclarationRegex);
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

  updateSignificantCodeChangeRegex();
  const diffText: LineDiff[] = Diff.diffLines(previousText, savedText);
  for (let diffTextPart of diffText) {
    if (diffTextPart.hasOwnProperty('added') || diffTextPart.hasOwnProperty('removed')) {
      if (diffTextPart.value.match(significantCodeChangeRegex)) {
        return true;
      }
    }
  }
  return false;
}

export function addMethodToWhitelist(methodName: string) {
  if (!methodName.match(/^[A-Za-z_$][A-Za-z0-9_]+$/gm)) {
    vscode.window.showInformationMessage("Not a valid method name.");
    return;
  }
  let methodWhitelist: Array<string> = vscode.workspace.getConfiguration("infer-for-vscode").get("methodWhitelist", []);
  for (const whitelistedMethod of methodWhitelist) {
    if (whitelistedMethod === methodName) {
      return;
    }
  }
  methodWhitelist.push(methodName);
  vscode.workspace.getConfiguration("infer-for-vscode").update("methodWhitelist", methodWhitelist, true);
}

export function removeMethodFromWhitelist(methodName: string) {
  let methodWhitelist: Array<string> = vscode.workspace.getConfiguration("infer-for-vscode").get("methodWhitelist", []);
  methodWhitelist = methodWhitelist.filter(method => method !== methodName);
  vscode.workspace.getConfiguration("infer-for-vscode").update("methodWhitelist", methodWhitelist, true);
}