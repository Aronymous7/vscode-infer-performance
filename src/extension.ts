import * as vscode from 'vscode';
import { CodelensProvider } from './CodelensProvider';

const childProcess = require('child_process');
const fs = require('fs');

let disposables: vscode.Disposable[] = [];

// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "infer-for-vscode" is now active!');

  let webviewPanel: vscode.WebviewPanel | undefined = undefined;

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  let disposable = vscode.commands.registerCommand('infer-for-vscode.runInferWebview', () => {
    if (webviewPanel) {
      // If we already have a webview panel, show it
      webviewPanel.reveal(vscode.ViewColumn.Two);
    } else {
      // Otherwise, execute Infer and create the webview panel
      if (!executeInferOnCurrentFile()) { return; }

      let inferCost = readInferCostFile();
      if (inferCost === null) { return; }

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
  disposables.push(disposable);
  context.subscriptions.push(disposable);

  const codelensProvider = new CodelensProvider();

  vscode.languages.registerCodeLensProvider("java", codelensProvider);

  vscode.commands.registerCommand("infer-for-vscode.enableCodeLens", () => {
    if (!executeInferOnCurrentFile()) { return; }
    vscode.workspace.getConfiguration("infer-for-vscode").update("enableCodeLens", true, true);
  });

  vscode.commands.registerCommand("infer-for-vscode.disableCodeLens", () => {
    vscode.workspace.getConfiguration("infer-for-vscode").update("enableCodeLens", false, true);
  });

  vscode.commands.registerCommand("infer-for-vscode.codelensAction", (args: any) => {
    vscode.window.showInformationMessage(`CodeLens action clicked with args=${args}`);
  });
}

// this method is called when your extension is deactivated
export function deactivate() {
  if (fs.existsSync('/tmp/infer-out')) {
    let inferOut = vscode.Uri.file('/tmp/infer-out');
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
    return false;
  }
  const sourceFileName = sourceFilePath.split("/").pop()?.split(".")[0];
  console.log(sourceFileName);
  childProcess.execSync(`infer --cost -o /tmp/infer-out/${sourceFileName} -- javac ${sourceFilePath}`);
  return true;
}

function readInferCostFile() {
  const sourceFileName = vscode.window.activeTextEditor?.document.fileName.split("/").pop()?.split(".")[0];
  try {
    const inferCostJsonString = fs.readFileSync(`/tmp/infer-out/${sourceFileName}/costs-report.json`);
    let inferCost = JSON.parse(inferCostJsonString);
    return inferCost.sort((a: any, b: any) => parseFloat(a.loc.lnum) - parseFloat(b.loc.lnum));
  } catch (err) {
    console.log(err);
    return null;
  }
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