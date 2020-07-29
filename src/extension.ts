import * as vscode from 'vscode';
import { DetailCodelensProvider } from './DetailCodelensProvider';
import { OverviewCodelensProvider } from './OverviewCodelensProvider';
import { InferCostItem } from './CustomTypes';
import { getMethodDeclarations, isExpensiveMethod } from './CommonFunctions';

const childProcess = require('child_process');
const fs = require('fs');

const inferOutputDirectory = '/tmp/infer-out';

let inferCost: InferCostItem[] | undefined = [];
let inferCostHistory = new Map<string, InferCostItem[]>();

let disposables: vscode.Disposable[] = [];
let activeTextEditor: vscode.TextEditor | undefined;

let detailCodeLensProviderDisposables = new Map();
let overviewCodeLensProviderDisposables = new Map();

let webviewOverview: vscode.WebviewPanel | undefined = undefined;
let webviewHistory: vscode.WebviewPanel | undefined = undefined;

// Decorator types that we use to decorate method declarations
const methodDeclarationDecorationType = vscode.window.createTextEditorDecorationType({
  after: {
    contentText: ' (cost could be displayed here as well)',
    color: 'rgba(50, 200, 50, 0.5)'
  }
});
const methodNameDecorationType = vscode.window.createTextEditorDecorationType({
  backgroundColor: 'rgba(150, 255, 10, 0.5)',
  overviewRulerColor: 'rgba(150, 250, 50, 1)',
  overviewRulerLane: vscode.OverviewRulerLane.Right,
});
const methodNameDecorationTypeExpensive = vscode.window.createTextEditorDecorationType({
  backgroundColor: 'rgba(255, 0, 0, 0.7)',
  overviewRulerColor: '#ff0000',
  overviewRulerLane: vscode.OverviewRulerLane.Right,
});

// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "infer-for-vscode" is now active!');

  let disposableCommand = vscode.commands.registerCommand("infer-for-vscode.executeInfer", () => {
    vscode.workspace.getConfiguration("infer-for-vscode").update("enableInfer", true, true);
    activeTextEditor = vscode.window.activeTextEditor;
    inferCost = executeInferOnCurrentFile();
    if (!inferCost) { return; }

    updateInferCostHistory();

    createCodeLenses();
    createEditorDecorators();

    vscode.window.showInformationMessage('Infer has been executed.');
  });
  disposables.push(disposableCommand);
  context.subscriptions.push(disposableCommand);

  disposableCommand = vscode.commands.registerCommand("infer-for-vscode.disableInfer", () => {
    vscode.workspace.getConfiguration("infer-for-vscode").update("enableInfer", false, true);
  });
  disposables.push(disposableCommand);
  context.subscriptions.push(disposableCommand);

  disposableCommand = vscode.commands.registerCommand("infer-for-vscode.detailCodelensAction", (methodKey: string) => {
    createWebviewHistory(methodKey);
  });
  disposables.push(disposableCommand);
  context.subscriptions.push(disposableCommand);

  disposableCommand = vscode.commands.registerCommand("infer-for-vscode.overviewCodelensAction", (selectedMethodName: string) => {
    createWebviewOverview(selectedMethodName);
  });
  disposables.push(disposableCommand);
  context.subscriptions.push(disposableCommand);
}

// this method is called when your extension is deactivated
export function deactivate() {
  if (fs.existsSync(inferOutputDirectory)) {
    let inferOut = vscode.Uri.file(inferOutputDirectory);
    vscode.workspace.fs.delete(inferOut, {recursive: true});
  }
  if (disposables) {
    disposables.forEach(item => item.dispose());
  }
  disposables = [];
}

function executeInferOnCurrentFile() {
  const sourceFilePath = activeTextEditor?.document.fileName;
  if (!sourceFilePath?.endsWith(".java")) {
    vscode.window.showInformationMessage('Infer can only be executed on Java files.');
    console.log("Tried to execute Infer on non-Java file.");
    return undefined;
  }
  const sourceFileName = sourceFilePath.split("/").pop()?.split(".")[0];
  childProcess.execSync(`infer --cost -o ${inferOutputDirectory}/${sourceFileName} -- javac ${sourceFilePath}`);

  let inferCost: InferCostItem[] = [];
  try {
    const inferCostJsonString = fs.readFileSync(`${inferOutputDirectory}/${sourceFileName}/costs-report.json`);
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
    if (fs.existsSync(`${inferOutputDirectory}/${sourceFileName}`)) {
      let inferOut = vscode.Uri.file(`${inferOutputDirectory}/${sourceFileName}`);
      vscode.workspace.fs.delete(inferOut, {recursive: true});
    }
  }
  return inferCost.sort((a: InferCostItem, b: InferCostItem) => a.loc.lnum - b.loc.lnum);
}

function updateInferCostHistory() {
  if (!inferCost) { return; }

  let currentTime = new Date().toLocaleString('en-US', { hour12: false });
  for (const inferCostItem of inferCost) {
    let costHistory: InferCostItem[] | undefined = [];
    if (inferCostHistory.has(inferCostItem.id)) {
      costHistory = inferCostHistory.get(inferCostItem.id);
    }
    if (!costHistory) { return; }
    if ((costHistory.length > 0) && (costHistory[0].exec_cost.polynomial === inferCostItem.exec_cost.polynomial)) {
      continue;
    }
    inferCostItem.timestamp = currentTime;
    costHistory.unshift(inferCostItem);
    inferCostHistory.set(inferCostItem.id, costHistory);
  }
}

function createCodeLenses() {
  if (!inferCost) { return; }

  const sourceFileName = activeTextEditor?.document.fileName.split("/").pop();
  const docSelector: vscode.DocumentSelector = { pattern: `**/${sourceFileName}`, language: 'java' };

  if (overviewCodeLensProviderDisposables.has(sourceFileName)) {
    overviewCodeLensProviderDisposables.get(sourceFileName).dispose();
  }
  let disposable = vscode.languages.registerCodeLensProvider(docSelector, new OverviewCodelensProvider());
  overviewCodeLensProviderDisposables.set(sourceFileName, disposable);
  disposables.push(disposable);

  if (detailCodeLensProviderDisposables.has(sourceFileName)) {
    detailCodeLensProviderDisposables.get(sourceFileName).dispose();
  }
  disposable = vscode.languages.registerCodeLensProvider(docSelector, new DetailCodelensProvider(inferCost));
  detailCodeLensProviderDisposables.set(sourceFileName, disposable);
  disposables.push(disposable);
}

function createEditorDecorators() {
  if (!inferCost) { return; }
  if (!activeTextEditor) { return; }

  const document = activeTextEditor.document;
  const methodDeclarations = getMethodDeclarations(document);
  const methodDeclarationDecorations: vscode.DecorationOptions[] = [];
  const methodNameDecorations: vscode.DecorationOptions[] = [];
  const methodNameDecorationsExpensive: vscode.DecorationOptions[] = [];
  for (let inferCostItem of inferCost) {
    methodDeclarations.some(methodDeclaration => {
      if (inferCostItem.method_name === methodDeclaration.name) {
        const declarationDecoration = { range: methodDeclaration.declarationRange };
        const nameDecoration = { range: methodDeclaration.nameRange, hoverMessage: `Execution cost: ${inferCostItem.exec_cost.polynomial} -- ${inferCostItem.exec_cost.big_o}` };
        methodDeclarationDecorations.push(declarationDecoration);
        if (isExpensiveMethod(inferCostItem.method_name, inferCost)) {
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
  if (!inferCost) { return; }

  if (webviewOverview) {
    webviewOverview.dispose();
  }

  // Create and show a new webview panel
  webviewOverview = vscode.window.createWebviewPanel(
    'inferCostOverview', // Identifies the type of the webview. Used internally
    'Infer Cost Overview', // Title of the panel displayed to the user
    vscode.ViewColumn.Two, // Editor column to show the new webview panel in.
    {localResourceRoots: []} // Webview options.
  );

  let inferCostOverviewHtmlString = "";
  for (let inferCostItem of inferCost) {
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
  if (!inferCost) { return; }

  if (webviewHistory) {
    webviewHistory.dispose();
  }

  // Create and show a new webview panel
  webviewHistory = vscode.window.createWebviewPanel(
    'inferCostHistory', // Identifies the type of the webview. Used internally
    'Infer Cost History', // Title of the panel displayed to the user
    vscode.ViewColumn.Two, // Editor column to show the new webview panel in.
    {localResourceRoots: []} // Webview options.
  );

  const costHistory = inferCostHistory.get(methodKey);
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