import * as vscode from 'vscode';
import { MethodDeclaration, LineDiff } from './types';
import { activeTextEditor, savedDocumentTexts, inferCosts, currentInferCost } from './inferController';

const Diff = require('diff');

export let constantMethods: string[] = [];
export let significantlyChangedMethods: string[] = [];

const significantCodeChange: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
export const onSignificantCodeChange: vscode.Event<void> = significantCodeChange.event;

const methodDeclarationRegex = new RegExp(/^(?:public|protected|private|static|final|native|synchronized|abstract|transient|\t| )+[\w\<\>\[\]]+\s+([A-Za-z_$][A-Za-z0-9_]*)(?<!if|switch|while|for|(public|private) [A-Za-z_$][A-Za-z0-9_]*)\([^\)]*\) *(?:\{(?:.*\})?|;)?/gm);
let significantCodeChangeRegex = new RegExp(/(?<!\/\/.*)(while *\([^\)]*\)|for *\([^\)]*\)|[A-Za-z_$][A-Za-z0-9_]*(?<!\W+(if|switch))\([^\)]*\))/g);

export function resetConstantMethods() {
  constantMethods = [];
}
export function resetSignificantlyChangedMethods() {
  significantlyChangedMethods = [];
}

export function removeConstantMethods() {
  for (const inferCostItem of currentInferCost) {
    const methodIndex = constantMethods.indexOf(inferCostItem.method_name);
    if (methodIndex > -1) {
      constantMethods.splice(methodIndex, 1);
    }
  }
}
export function removeSignificantlyChangedMethods() {
  for (const inferCostItem of currentInferCost) {
    const methodIndex = significantlyChangedMethods.indexOf(inferCostItem.method_name);
    if (methodIndex > -1) {
      significantlyChangedMethods.splice(methodIndex, 1);
    }
  }
}

export function findMethodDeclarations(document: vscode.TextDocument) {
  const regex = new RegExp(methodDeclarationRegex);
  const text = document.getText();
  let methodDeclarations: MethodDeclaration[] = [];
  let matches: RegExpExecArray | null;
  while ((matches = regex.exec(text)) !== null) {
    const line = document.lineAt(document.positionAt(matches.index).line);

    const declarationLines = matches[0].split("\n");
    const declarationStartPosition = new vscode.Position(line.lineNumber, 0);
    const declarationEndPosition = new vscode.Position(line.lineNumber + declarationLines.length - 1, declarationLines[declarationLines.length - 1].length);
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

export function significantCodeChangeCheck(savedText: string) {
  const previousText = savedDocumentTexts.get(activeTextEditor.document.fileName);
  if (!previousText) { return false; }

  const methodWhitelist = constantMethods.concat(vscode.workspace.getConfiguration("infer-for-vscode").get("methodWhitelist", []));
  const diffText: LineDiff[] = Diff.diffLines(previousText, savedText);
  let containingMethods: string[] = [];
  let isSignificant = false;
  for (let diffTextPartIndex in diffText) {
    let diffTextPart = diffText[diffTextPartIndex];
    if (diffTextPart.hasOwnProperty('added') || diffTextPart.hasOwnProperty('removed')) {
      let diffTextPartValueWithoutDeclarations = diffTextPart.value.replace(methodDeclarationRegex, "");
      let matches = diffTextPartValueWithoutDeclarations.match(significantCodeChangeRegex);
      if (matches) {
        let containingMethod = "";
        for (let i = +diffTextPartIndex - 1; i >= 0; i--){
          let prevDiffTextPart = diffText[i];
          const regex = new RegExp(methodDeclarationRegex);
          let declarationMatches: RegExpExecArray | null;
          while ((declarationMatches = regex.exec(prevDiffTextPart.value)) !== null) {
            containingMethod = declarationMatches[1];
          }
          if (containingMethod !== "") {
            break;
          }
        }
        for (const match of matches) {
          let diffTextPartValueBeforeMatch = diffTextPart.value.split(match)[0];
          const regex = new RegExp(methodDeclarationRegex);
          let declarationMatches: RegExpExecArray | null;
          while ((declarationMatches = regex.exec(diffTextPartValueBeforeMatch)) !== null) {
            containingMethod = declarationMatches[1];
          }
          if (!containingMethods.includes(containingMethod) && !methodWhitelist.includes(match.split("(")[0])) {
            if (!significantlyChangedMethods.includes(containingMethod)) {
              significantlyChangedMethods.push(containingMethod);
            }
            if (containingMethod !== "") {
              containingMethods.push(containingMethod);
            }
            isSignificant = true;
          }
        }
      }
    }
  }
  const revertedMethods = significantlyChangedMethods.filter(method => !containingMethods.includes(method));
  for (const method of revertedMethods) {
    const methodIndex = significantlyChangedMethods.indexOf(method);
    significantlyChangedMethods.splice(methodIndex, 1);
  }
  if (isSignificant || revertedMethods.length > 0) {
    significantCodeChange.fire();
  }
  return isSignificant;
}

export function addMethodToWhitelist(methodName: string) {
  if (!methodName.match(/^[A-Za-z_$][A-Za-z0-9_]+$/gm)) {
    vscode.window.showInformationMessage("Not a valid method name.");
    return;
  }
  let methodWhitelist: string[] = vscode.workspace.getConfiguration("infer-for-vscode").get("methodWhitelist", []);
  for (const whitelistedMethod of methodWhitelist) {
    if (whitelistedMethod === methodName) {
      return;
    }
  }
  methodWhitelist.push(methodName);
  vscode.workspace.getConfiguration("infer-for-vscode").update("methodWhitelist", methodWhitelist, true);
}

export function removeMethodFromWhitelist(methodName: string) {
  let methodWhitelist: string[] = vscode.workspace.getConfiguration("infer-for-vscode").get("methodWhitelist", []);
  methodWhitelist = methodWhitelist.filter(method => method !== methodName);
  vscode.workspace.getConfiguration("infer-for-vscode").update("methodWhitelist", methodWhitelist, true);
}