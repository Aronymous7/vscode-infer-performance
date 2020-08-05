import * as vscode from 'vscode';
import { currentInferCost, inferCostHistories } from './inferController';

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