import * as vscode from 'vscode';

const childProcess = require('child_process');
const fs = require('fs');

// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

  // This line of code will only be executed once when your extension is activated
  console.log('Congratulations, your extension "infer-for-vscode" is now active!');

  let webviewPanel: vscode.WebviewPanel | undefined = undefined;

  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  let disposable = vscode.commands.registerCommand('infer-for-vscode.runInfer', () => {
    if (webviewPanel) {
      // If we already have a webview panel, show it
      webviewPanel.reveal(vscode.ViewColumn.Two);
    } else {
      // Otherwise, execute Infer and create the webview panel
      const sourceFilePath = vscode.window.activeTextEditor?.document.fileName;
      childProcess.execSync('infer --cost -o /tmp/infer-out -- javac ' + sourceFilePath);

      let inferCostRaw;
      try {
        const inferCostRawJsonString = fs.readFileSync('/tmp/infer-out/costs-report.json');
        inferCostRaw = JSON.parse(inferCostRawJsonString);
      } catch (err) {
        console.log(err);
        return;
      }

      // Create and show a new webview panel
      webviewPanel = vscode.window.createWebviewPanel(
        'inferCost', // Identifies the type of the webview. Used internally
        'Infer Cost', // Title of the panel displayed to the user
        vscode.ViewColumn.Two, // Editor column to show the new webview panel in.
        {localResourceRoots: []} // Webview options.
      );

      let inferCostHtmlString = "";
      for (let inferCostItem of inferCostRaw) {
        if (inferCostItem.procedure_name === '<init>') {continue;}
        inferCostHtmlString += `<div>
  <h2>${inferCostItem.procedure_name} (line ${inferCostItem.loc.lnum})</h2>
  <div>Allocation cost: ${inferCostItem.alloc_cost.hum.hum_polynomial}</div>
  <div>Execution cost: ${inferCostItem.exec_cost.hum.hum_polynomial}</div>
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
    }

    vscode.window.showInformationMessage('Infer has been executed!');
  });

  context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {
  if (fs.existsSync('/tmp/infer-out')) {
    let inferOut = vscode.Uri.file('/tmp/infer-out');
    vscode.workspace.fs.delete(inferOut, {recursive: true});
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