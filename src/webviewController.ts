import * as vscode from 'vscode';
import { currentInferCost, inferCostHistories, activeTextEditor } from './inferController';

const cssStyling = `ul, h3 {
  margin: 0;
}
.selected-method {
  background-color: rgba(200, 200, 0, 0.2);
}
strong {
  background-color: rgba(200, 100, 0, 0.5);
}`;

let webviewOverview: vscode.WebviewPanel;
let webviewHistory: vscode.WebviewPanel;

export function disposeWebviews() {
  if (webviewOverview) {
    webviewOverview.dispose();
  }
  if (webviewHistory) {
    webviewHistory.dispose();
  }
}

export function createWebviewOverview(selectedMethodName: string) {
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
    inferCostOverviewHtmlString += `<div>
  <h2${inferCostItem.method_name === selectedMethodName ? ' class="selected-method"' : ''}>${inferCostItem.method_name} (line ${inferCostItem.loc.lnum})</h2>
  <div>
    <h3>Execution cost:</h3>
    <ul>
      <li>${inferCostItem.exec_cost.polynomial}</li>
      <li>${inferCostItem.exec_cost.big_o}</li>
    </ul>
  </div>
  <div>
    <h3>Allocation cost:</h3>
    <ul>
      <li>${inferCostItem.alloc_cost.polynomial}</li>
      <li>${inferCostItem.alloc_cost.big_o}</li>
    </ul>
  </div>
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
    ${cssStyling}
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

export function createWebviewHistory(methodKey: string) {
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

  let significantlyChangedString = "";
  if (costHistory[0].changeCauseMethods) {
    let causeMethodsString = "";
    for (const causeMethod of costHistory[0].changeCauseMethods) {
      causeMethodsString += `<li>${causeMethod}</li>`;
    }
    significantlyChangedString = `<div>
    <strong>Cost might have changed significantly!</strong> Potential causes (additions or removals):
    <ul>
      ${causeMethodsString}
    </ul>
  </div>`;
  }

  let inferCostHistoryHtmlString = ``;
  for (let costHistoryItem of costHistory) {
    inferCostHistoryHtmlString += `<div>
  <h2>${costHistoryItem.timestamp + (costHistoryItem === costHistory[0] ? ' (most recent)' : '')}</h2>
  <div>
    <h3>Execution cost:</h3>
    <ul>
      <li>${costHistoryItem.exec_cost.polynomial}</li>
      <li>${costHistoryItem.exec_cost.big_o}</li>
    </ul>
  </div>
  <div>
    <h3>Allocation cost:</h3>
    <ul>
      <li>${costHistoryItem.alloc_cost.polynomial}</li>
      <li>${costHistoryItem.alloc_cost.big_o}</li>
    </ul>
  </div>
  ${costHistoryItem === costHistory[0] ? significantlyChangedString : ''}
</div>
<hr>`;
  }

  webviewHistory.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Infer Cost History</title>
  <style>
    ${cssStyling}
  </style>
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