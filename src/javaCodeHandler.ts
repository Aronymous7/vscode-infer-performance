import * as vscode from 'vscode';
import { MethodDeclaration, LineDiff, InferCostItem } from './types';
import { activeTextEditor, savedDocumentTexts, inferCosts } from './inferController';

const Diff = require('diff');

let areConstantMethodsStale = true;

let constantMethods: string[];
let methodDeclarations: MethodDeclaration[] = [];

const methodDeclarationRegex = new RegExp(/^(?:public|protected|private|static|final|native|synchronized|abstract|transient|\t| )+[\w\<\>\[\]]+\s+([A-Za-z_$][A-Za-z0-9_]*)(?<!if|switch|while|for|public [A-Za-z_$][A-Za-z0-9_]*)\([^\)]*\) *(?:\{(?:.*\})?|;)?/gm);
let significantCodeChangeRegex = new RegExp(/while *\(.+\)|for *\(.+\)|[A-Za-z_$][A-Za-z0-9_]+(?<!\W+(if|switch))\([^\)]*\)/g);

export function setConstantMethodsStale() {
  areConstantMethodsStale = true;
}

export function getMethodDeclarations() {
  return methodDeclarations;
}

export function findMethodDeclarations(document: vscode.TextDocument) {
  const regex = new RegExp(methodDeclarationRegex);
  const text = document.getText();
  methodDeclarations = [];
  let matches;
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

export function isSignificantCodeChange(savedText: string) {
  const previousText = savedDocumentTexts.get(activeTextEditor.document.fileName);
  if (!previousText) { return false; }

  if (areConstantMethodsStale) {
    findConstantMethods();
  }

  const methodWhitelist = constantMethods.concat(vscode.workspace.getConfiguration("infer-for-vscode").get("methodWhitelist", []));
  const diffText: LineDiff[] = Diff.diffLines(previousText, savedText);
  let allMatches: string[] = [];
  let isSignificant = false;
  for (let diffTextPart of diffText) {
    if (diffTextPart.hasOwnProperty('added') || diffTextPart.hasOwnProperty('removed')) {
      let matches = diffTextPart.value.match(significantCodeChangeRegex);
      if (matches) {
        for (const match of matches) {
          allMatches.push(match.split("(")[0]);
        }
      }
    }
  }
  if (allMatches.filter(methodName => !methodWhitelist.includes(methodName)).length !== 0) {
    isSignificant = true;
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

function findConstantMethods() {
  let inferCost: InferCostItem[] = [];
  for (const inferCostSubset of inferCosts.values()) {
    inferCost = inferCost.concat(inferCostSubset);
  }
  constantMethods = [];
  for (const inferCostItem of inferCost) {
    if (inferCostItem.exec_cost.degree === 0) {
      constantMethods.push(inferCostItem.method_name);
    }
  }
  areConstantMethodsStale = false;
}