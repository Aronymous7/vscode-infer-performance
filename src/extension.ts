import * as vscode from 'vscode';
import * as Constants from './Constants';
import { DetailCodelensProvider } from './DetailCodelensProvider';
import { OverviewCodelensProvider } from './OverviewCodelensProvider';
import { InferCostItem, LineDiff } from './CustomTypes';
import { getMethodDeclarations, isExpensiveMethod } from './CommonFunctions';

const childProcess = require('child_process');
const fs = require('fs');
const Diff = require('diff');

let currentInferCost: InferCostItem[];
let inferCosts = new Map<string, InferCostItem[]>();          // [document.fileName, inferCost]
let inferCostHistories = new Map<string, InferCostItem[]>();  // [inferCostItem.id, costHistory]

let disposables: vscode.Disposable[] = [];
let activeTextEditor: vscode.TextEditor;
let activeTextEditorTexts = new Map<string, string>();        // [document.fileName, text]

// [sourceFilePath, codeLensDisposable]
let overviewCodeLensProviderDisposables = new Map<string, vscode.Disposable>();
let detailCodeLensProviderDisposables = new Map<string, vscode.Disposable>();

let webviewOverview: vscode.WebviewPanel;
let webviewHistory: vscode.WebviewPanel;

// Decorator types that we use to decorate method declarations
let methodDeclarationDecorationType: vscode.TextEditorDecorationType;
let methodNameDecorationType: vscode.TextEditorDecorationType;
let methodNameDecorationTypeExpensive: vscode.TextEditorDecorationType;
let areDecorationTypesSet: boolean = false;

// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  let disposableCommand = vscode.commands.registerCommand("infer-for-vscode.executeInfer", () => {
    vscode.workspace.getConfiguration("infer-for-vscode").update("enableInfer", true, true);
    const success = executeInfer(true);
    if (success) {
      vscode.window.showInformationMessage('Infer has been executed.');
    }
  });
  disposables.push(disposableCommand);
  context.subscriptions.push(disposableCommand);

  disposableCommand = vscode.commands.registerCommand("infer-for-vscode.disableInfer", () => {
    vscode.workspace.getConfiguration("infer-for-vscode").update("enableInfer", false, true);
    disableInfer();
  });
  disposables.push(disposableCommand);
  context.subscriptions.push(disposableCommand);

  disposableCommand = vscode.commands.registerCommand("infer-for-vscode.detailCodelensAction", (methodKey: string) => {
    createWebviewHistory(methodKey);
  });
  disposables.push(disposableCommand);
  context.subscriptions.push(disposableCommand);

  disposableCommand = vscode.commands.registerCommand("infer-for-vscode.detailCodelensError", (methodKey: string) => {
    vscode.window.showInformationMessage("Please save and re-execute Infer.");
  });
  disposables.push(disposableCommand);
  context.subscriptions.push(disposableCommand);

  disposableCommand = vscode.commands.registerCommand("infer-for-vscode.overviewCodelensAction", (selectedMethodName: string) => {
    createWebviewOverview(selectedMethodName);
  });
  disposables.push(disposableCommand);
  context.subscriptions.push(disposableCommand);

  vscode.window.onDidChangeActiveTextEditor(editor => {
    if (editor) {
      activeTextEditor = editor;
      console.log(activeTextEditor.document);
      const tmpInferCost = inferCosts.get(activeTextEditor.document.fileName);
      if (tmpInferCost) {
        currentInferCost = tmpInferCost;
        createEditorDecorators();
      }
    }
  }, null, context.subscriptions);

  vscode.workspace.onDidSaveTextDocument(event => {
    if (isSignificantCodeChange(event.getText())) {
      vscode.window.showInformationMessage("Re-executing Infer...");
      executeInfer(false);
    }
  }, null, context.subscriptions);
}

// this method is called when your extension is deactivated
export function deactivate() {
  if (fs.existsSync(Constants.INFER_OUTPUT_DIRECTORY)) {
    let inferOut = vscode.Uri.file(Constants.INFER_OUTPUT_DIRECTORY);
    vscode.workspace.fs.delete(inferOut, {recursive: true});
  }
  disableInfer();
  if (disposables) {
    disposables.forEach(item => item.dispose());
  }
  disposables = [];
}

function executeInfer(isManualCall: boolean) {
  if (!areDecorationTypesSet) {
    initializeDecorationTypes();
  }

  const tmpActiveTextEditor = vscode.window.activeTextEditor;
  if (tmpActiveTextEditor) {
    activeTextEditor = tmpActiveTextEditor;
    activeTextEditorTexts.set(activeTextEditor.document.fileName, activeTextEditor.document.getText());
  } else { return false; }

  const tmpInferCost = executeInferOnCurrentFile(isManualCall);
  if (tmpInferCost) {
    currentInferCost = tmpInferCost;
    inferCosts.set(activeTextEditor.document.fileName, tmpInferCost);
  } else { return false; }

  updateInferCostHistory();

  createCodeLenses();
  createEditorDecorators();

  return true;
}

function disableInfer() {
  if (areDecorationTypesSet) {
    methodDeclarationDecorationType.dispose();
    methodNameDecorationType.dispose();
    methodNameDecorationTypeExpensive.dispose();

    areDecorationTypesSet = false;
  }

  for (const codeLensProviderMapEntry of detailCodeLensProviderDisposables) {
    codeLensProviderMapEntry[1].dispose();
  }
  for (const codeLensProviderMapEntry of overviewCodeLensProviderDisposables) {
    codeLensProviderMapEntry[1].dispose();
  }

  if (webviewOverview) {
    webviewOverview.dispose();
  }
  if (webviewHistory) {
    webviewHistory.dispose();
  }
}

function initializeDecorationTypes() {
  methodDeclarationDecorationType = vscode.window.createTextEditorDecorationType({
    after: {
      contentText: ' (warn about significant changes here)',
      color: '#ff0000'
    }
  });
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

  areDecorationTypesSet = true;
}

function executeInferOnCurrentFile(isManualCall: boolean) {
  const sourceFilePath = activeTextEditor.document.fileName;
  if (!sourceFilePath.endsWith(".java")) {
    vscode.window.showInformationMessage('Infer can only be executed on Java files.');
    console.log("Tried to execute Infer on non-Java file.");
    return undefined;
  }
  const sourceFileName = sourceFilePath.split("/").pop()?.split(".")[0];
  try {
    childProcess.execSync(`infer --cost-only -o ${Constants.INFER_OUTPUT_DIRECTORY}/${sourceFileName} -- javac ${sourceFilePath}`);
  } catch (err) {
    if (isManualCall) {
      vscode.window.showErrorMessage("Execution of Infer failed (probably due to compilation error).");
    } else {
      vscode.window.showErrorMessage("Re-execution of Infer failed (probably due to compilation error).");
    }
    console.log("Execution of infer command failed (probably due to compilation error).");
    return undefined;
  }

  let inferCost: InferCostItem[] = [];
  try {
    const inferCostJsonString = fs.readFileSync(`${Constants.INFER_OUTPUT_DIRECTORY}/${sourceFileName}/costs-report.json`);
    let inferCostRaw = JSON.parse(inferCostJsonString);
    for (let inferCostRawItem of inferCostRaw) {
      inferCost.push({
        id: `${sourceFilePath}:${inferCostRawItem.procedure_name}`,
        method_name: inferCostRawItem.procedure_name,
        loc: {
          file: inferCostRawItem.loc.file,
          lnum: inferCostRawItem.loc.lnum
        },
        alloc_cost: {
          polynomial: inferCostRawItem.alloc_cost.hum.hum_polynomial,
          degree: inferCostRawItem.alloc_cost.hum.hum_degree,
          big_o: inferCostRawItem.alloc_cost.hum.big_o
        },
        exec_cost: {
          polynomial: inferCostRawItem.exec_cost.hum.hum_polynomial,
          degree: inferCostRawItem.exec_cost.hum.hum_degree,
          big_o: inferCostRawItem.exec_cost.hum.big_o
        }
      });
    }
  } catch (err) {
    console.log(err);
    console.log("InferCost file could not be read.");
    return undefined;
  } finally {
    if (fs.existsSync(`${Constants.INFER_OUTPUT_DIRECTORY}/${sourceFileName}`)) {
      let inferOut = vscode.Uri.file(`${Constants.INFER_OUTPUT_DIRECTORY}/${sourceFileName}`);
      vscode.workspace.fs.delete(inferOut, {recursive: true});
    }
  }
  return inferCost.sort((a: InferCostItem, b: InferCostItem) => a.loc.lnum - b.loc.lnum);
}

function updateInferCostHistory() {
  let currentTime = new Date().toLocaleString('en-US', { hour12: false });
  for (const inferCostItem of currentInferCost) {
    let costHistory: InferCostItem[] | undefined = [];
    if (inferCostHistories.has(inferCostItem.id)) {
      costHistory = inferCostHistories.get(inferCostItem.id);
    }
    if (!costHistory) { return; }
    if ((costHistory.length > 0) && (costHistory[0].exec_cost.polynomial === inferCostItem.exec_cost.polynomial)) {
      continue;
    }
    inferCostItem.timestamp = currentTime;
    costHistory.unshift(inferCostItem);
    inferCostHistories.set(inferCostItem.id, costHistory);
  }
}

function isSignificantCodeChange(savedText: string) {
  const previousText = activeTextEditorTexts.get(activeTextEditor.document.fileName);
  if (!previousText) { return false; }

  const diffText: LineDiff[] = Diff.diffLines(previousText, savedText);
  for (let diffTextPart of diffText) {
    if (diffTextPart.hasOwnProperty('added') || diffTextPart.hasOwnProperty('removed')) {
      if (diffTextPart.value.match(Constants.SIGNIFICANT_CODE_CHANGE_REGEX)) {
        return true;
      }
    }
  }
  return false;
}

function createCodeLenses() {
  const sourceFilePath = activeTextEditor.document.fileName;
  const docSelector: vscode.DocumentSelector = { pattern: sourceFilePath, language: 'java' };

  overviewCodeLensProviderDisposables.get(sourceFilePath)?.dispose();
  let codeLensProviderDisposable = vscode.languages.registerCodeLensProvider(docSelector, new OverviewCodelensProvider());
  overviewCodeLensProviderDisposables.set(sourceFilePath, codeLensProviderDisposable);

  detailCodeLensProviderDisposables.get(sourceFilePath)?.dispose();
  codeLensProviderDisposable = vscode.languages.registerCodeLensProvider(docSelector, new DetailCodelensProvider(currentInferCost));
  detailCodeLensProviderDisposables.set(sourceFilePath, codeLensProviderDisposable);
}

function createEditorDecorators() {
  const methodDeclarations = getMethodDeclarations(activeTextEditor.document);

  const methodDeclarationDecorations: vscode.DecorationOptions[] = [];
  const methodNameDecorations: vscode.DecorationOptions[] = [];
  const methodNameDecorationsExpensive: vscode.DecorationOptions[] = [];
  for (let inferCostItem of currentInferCost) {
    methodDeclarations.some(methodDeclaration => {
      if (inferCostItem.method_name === methodDeclaration.name) {
        const declarationDecoration = { range: methodDeclaration.declarationRange };
        const nameDecoration = { range: methodDeclaration.nameRange, hoverMessage: `Execution cost: ${inferCostItem.exec_cost.polynomial} -- ${inferCostItem.exec_cost.big_o}` };
        methodDeclarationDecorations.push(declarationDecoration);
        if (isExpensiveMethod(inferCostItem.method_name, currentInferCost)) {
          methodNameDecorationsExpensive.push(nameDecoration);
        } else {
          methodNameDecorations.push(nameDecoration);
        }
        return true;
      }
    });
  }
  activeTextEditor.setDecorations(methodDeclarationDecorationType, methodDeclarationDecorations);
  activeTextEditor.setDecorations(methodNameDecorationType, methodNameDecorations);
  activeTextEditor.setDecorations(methodNameDecorationTypeExpensive, methodNameDecorationsExpensive);
}

function createWebviewOverview(selectedMethodName: string) {
  if (webviewOverview) {
    webviewOverview.dispose();
  }

  // Create and show a new webview panel
  webviewOverview = vscode.window.createWebviewPanel(
    'inferCostOverview', // Identifies the type of the webview. Used internally
    'Infer Cost Overview', // Title of the panel displayed to the user
    {viewColumn: vscode.ViewColumn.Two, preserveFocus: true}, // Editor column to show the new webview panel in.
    {localResourceRoots: []} // Webview options.
  );

  let inferCostOverviewHtmlString = "";
  for (let inferCostItem of currentInferCost) {
    if (inferCostItem.method_name === '<init>') { continue; }
    inferCostOverviewHtmlString += `<div${inferCostItem.method_name === selectedMethodName ? ' class="selected-method"' : ''}>
<h2>${inferCostItem.method_name} (line ${inferCostItem.loc.lnum})</h2>
<div>Allocation cost: ${inferCostItem.alloc_cost.polynomial} : ${inferCostItem.alloc_cost.big_o}</div>
<div>Execution cost: ${inferCostItem.exec_cost.polynomial} : ${inferCostItem.exec_cost.big_o}</div>
</div>
<hr>`;
  }

  webviewOverview.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Infer Cost Overview</title>
  <style>
.selected-method {
  background-color: rgba(200, 200, 0, 0.2);
}
  </style>
</head>
<body>
  <h1>Infer Cost Overview</h1>
  <div>
    <hr>
    ${inferCostOverviewHtmlString}
  <div>
</body>
</html>`;
}

function createWebviewHistory(methodKey: string) {
  if (webviewHistory) {
    webviewHistory.dispose();
  }

  // Create and show a new webview panel
  webviewHistory = vscode.window.createWebviewPanel(
    'inferCostHistory', // Identifies the type of the webview. Used internally
    'Infer Cost History', // Title of the panel displayed to the user
    {viewColumn: vscode.ViewColumn.Two, preserveFocus: true}, // Editor column to show the new webview panel in.
    {localResourceRoots: []} // Webview options.
  );

  const costHistory = inferCostHistories.get(methodKey);
  if (!costHistory || costHistory.length <= 0) { return; }
  let inferCostHistoryHtmlString = ``;
  for (let costHistoryItem of costHistory) {
    inferCostHistoryHtmlString += `<div>
<h2>${costHistoryItem.timestamp + (costHistoryItem === costHistory[0] ? ' (most recent)' : '')}</h2>
<div>Allocation cost: ${costHistoryItem.alloc_cost.polynomial} : ${costHistoryItem.alloc_cost.big_o}</div>
<div>Execution cost: ${costHistoryItem.exec_cost.polynomial} : ${costHistoryItem.exec_cost.big_o}</div>
</div>
<hr>`;
  }

  webviewHistory.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Infer Cost History</title>
</head>
<body>
  <h1>Infer Cost History for: ${costHistory[0].method_name} (line ${costHistory[0].loc.lnum})</h1>
  <div>
    <hr>
    ${inferCostHistoryHtmlString}
  <div>
</body>
</html>`;
}