import * as vscode from 'vscode';
import { CodelensProvider } from './CodelensProvider';
import { InferCostItem } from './CustomTypes';
import { getMethodDeclarations, isExpensiveMethod } from './CommonFunctions';

const childProcess = require('child_process');
const fs = require('fs');

let disposables: vscode.Disposable[] = [];

const inferOutputDirectory = '/tmp/infer-out';

// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "infer-for-vscode" is now active!');

  // --- Webview ---

  let webviewPanel: vscode.WebviewPanel | undefined = undefined;

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  let disposableCommand = vscode.commands.registerCommand('infer-for-vscode.runInferWebview', () => {
    if (webviewPanel) {
      // If we already have a webview panel, show it
      webviewPanel.reveal(vscode.ViewColumn.Two);
    } else {
      // Otherwise, execute Infer and create the webview panel
      let inferCost: InferCostItem[] | undefined = executeInferOnCurrentFile();
      if (inferCost === undefined) { return; }

      // Create and show a new webview panel
      webviewPanel = vscode.window.createWebviewPanel(
        'inferCost', // Identifies the type of the webview. Used internally
        'Infer Cost', // Title of the panel displayed to the user
        vscode.ViewColumn.Two, // Editor column to show the new webview panel in.
        {localResourceRoots: []} // Webview options.
      );

      let inferCostHtmlString = "";
      for (let inferCostItem of inferCost) {
        if (inferCostItem.procedure_name === '<init>') { continue; }
        inferCostHtmlString += `<div>
  <h2>${inferCostItem.procedure_name} (line ${inferCostItem.loc.lnum})</h2>
  <div>Allocation cost: ${inferCostItem.alloc_cost.hum.hum_polynomial} : ${inferCostItem.alloc_cost.hum.big_o}</div>
  <div>Execution cost: ${inferCostItem.exec_cost.hum.hum_polynomial} : ${inferCostItem.exec_cost.hum.big_o}</div>
</div>
<hr>`;
      }
      webviewPanel.webview.html = getInferWebviewContent(inferCostHtmlString);

      // Reset when the current panel is closed
      webviewPanel.onDidDispose(
        () => {
          webviewPanel = undefined;
        },
        null,
        context.subscriptions
      );

      vscode.window.showInformationMessage('Infer has been executed.');
    }
  });
  disposables.push(disposableCommand);
  context.subscriptions.push(disposableCommand);

  // --- CodeLens ---

  let codeLensProviderDisposables = new Map();

  disposableCommand = vscode.commands.registerCommand("infer-for-vscode.enableCodeLens", () => {
    let inferCost: InferCostItem[] | undefined = executeInferOnCurrentFile();
    if (inferCost === undefined) { return; }

    const sourceFileName = vscode.window.activeTextEditor?.document.fileName.split("/").pop();
    const docSelector: vscode.DocumentSelector = { pattern: `**/${sourceFileName}`, language: 'java' };
    if (codeLensProviderDisposables.has(sourceFileName)) {
      codeLensProviderDisposables.get(sourceFileName).dispose();
    }
    let disposable = vscode.languages.registerCodeLensProvider(docSelector, new CodelensProvider(inferCost));
    codeLensProviderDisposables.set(sourceFileName, disposable);
    vscode.workspace.getConfiguration("infer-for-vscode").update("enableCodeLens", true, true);
    disposables.push(disposable);

    vscode.window.showInformationMessage('Infer has been executed.');
  });
  disposables.push(disposableCommand);
  context.subscriptions.push(disposableCommand);

  disposableCommand = vscode.commands.registerCommand("infer-for-vscode.disableCodeLens", () => {
    vscode.workspace.getConfiguration("infer-for-vscode").update("enableCodeLens", false, true);
  });
  disposables.push(disposableCommand);
  context.subscriptions.push(disposableCommand);

  disposableCommand = vscode.commands.registerCommand("infer-for-vscode.codelensAction", (args: any) => {
    vscode.window.showInformationMessage(`CodeLens action clicked with args=${args}`);
  });
  disposables.push(disposableCommand);
  context.subscriptions.push(disposableCommand);

  // --- Editor Decorator ---

  let timeout: NodeJS.Timer | undefined = undefined;

  // create decorator types that we use to decorate method declarations
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

  disposableCommand = vscode.commands.registerCommand("infer-for-vscode.enableEditorDecorator", () => {
    let inferCost: InferCostItem[] | undefined = executeInferOnCurrentFile();
    if (inferCost === undefined) { return; }

    let activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) { return; }
    const document = activeEditor.document;
    const methodDeclarations = getMethodDeclarations(document);
    const methodDeclarationDecorations: vscode.DecorationOptions[] = [];
    const methodNameDecorations: vscode.DecorationOptions[] = [];
    const methodNameDecorationsExpensive: vscode.DecorationOptions[] = [];
    for (let inferCostItem of inferCost) {
      methodDeclarations.some(methodDeclaration => {
        if (inferCostItem.procedure_name === methodDeclaration.name) {
          const declarationDecoration = { range: methodDeclaration.declarationRange };
          const nameDecoration = { range: methodDeclaration.nameRange, hoverMessage: `Execution cost: ${inferCostItem.exec_cost.hum.hum_polynomial} -- ${inferCostItem.exec_cost.hum.big_o}` };
          methodDeclarationDecorations.push(declarationDecoration);
          if (isExpensiveMethod(inferCostItem.procedure_name, inferCost)) {
            methodNameDecorationsExpensive.push(nameDecoration);
          } else {
            methodNameDecorations.push(nameDecoration);
          }
          return true;
        }
      });
    }
    activeEditor.setDecorations(methodDeclarationDecorationType, methodDeclarationDecorations);
    activeEditor.setDecorations(methodNameDecorationType, methodNameDecorations);
    activeEditor.setDecorations(methodNameDecorationTypeExpensive, methodNameDecorationsExpensive);
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
  const sourceFilePath = vscode.window.activeTextEditor?.document.fileName;
  if (!sourceFilePath?.endsWith(".java")) {
    vscode.window.showInformationMessage('Infer can only be executed on Java files.');
    console.log("Tried to execute Infer on non-Java file.");
    return undefined;
  }
  const sourceFileName = sourceFilePath.split("/").pop()?.split(".")[0];
  childProcess.execSync(`infer --cost -o ${inferOutputDirectory}/${sourceFileName} -- javac ${sourceFilePath}`);

  let inferCost: InferCostItem[];
  try {
    const inferCostJsonString = fs.readFileSync(`${inferOutputDirectory}/${sourceFileName}/costs-report.json`);
    inferCost = JSON.parse(inferCostJsonString);
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

function getInferWebviewContent(inferCostHtmlString: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Infer Cost</title>
</head>
<body>
  <h1>Infer Cost</h1>
  <div>
    ${inferCostHtmlString}
  <div>
</body>
</html>`;
}