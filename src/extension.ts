import * as vscode from 'vscode';
import { INFER_OUTPUT_DIRECTORY } from './constants';
import {
  inferCosts,
  executeInfer,
  disableInfer,
  setCurrentInferCost,
  setActiveTextEditor
} from './inferController';
import { isSignificantCodeChange } from './javaCodeHandler';
import { createEditorDecorators } from './editorDecoratorController';
import { createWebviewOverview, createWebviewHistory } from './webviewController';

const fs = require('fs');

let disposables: vscode.Disposable[] = [];
let isAutoReExecutionEnabled = false;

// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  let disposableCommand = vscode.commands.registerCommand("infer-for-vscode.executeInfer", async () => {
    vscode.workspace.getConfiguration("infer-for-vscode").update("enableInfer", true, true);
    const success = await executeInfer(true);
    isAutoReExecutionEnabled = true;
    if (success) {
      vscode.window.showInformationMessage('Infer has been executed.');
    }
  });
  disposables.push(disposableCommand);
  context.subscriptions.push(disposableCommand);

  disposableCommand = vscode.commands.registerCommand("infer-for-vscode.disableInfer", () => {
    isAutoReExecutionEnabled = false;
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
      setActiveTextEditor(editor);
      const tmpInferCost = inferCosts.get(editor.document.fileName);
      if (tmpInferCost) {
        setCurrentInferCost(tmpInferCost);
        createEditorDecorators();
      }
    }
  }, null, context.subscriptions);

  vscode.workspace.onDidSaveTextDocument(event => {
    if (vscode.workspace.getConfiguration("infer-for-vscode").get("enableInfer", false) &&
        isAutoReExecutionEnabled &&
        isSignificantCodeChange(event.getText())) {

      vscode.window.showInformationMessage("Re-executing Infer...");
      executeInfer(false);
    }
  }, null, context.subscriptions);
}

// this method is called when your extension is deactivated
export function deactivate() {
  if (fs.existsSync(INFER_OUTPUT_DIRECTORY)) {
    let inferOut = vscode.Uri.file(INFER_OUTPUT_DIRECTORY);
    vscode.workspace.fs.delete(inferOut, {recursive: true});
  }
  disableInfer();
  if (disposables) {
    disposables.forEach(item => item.dispose());
  }
  disposables = [];
}