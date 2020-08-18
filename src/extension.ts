import * as vscode from 'vscode';
import { INFER_OUTPUT_DIRECTORY } from './constants';
import {
  inferCosts,
  executeInfer,
  disableInfer,
  setCurrentInferCost,
  setActiveTextEditor
} from './inferController';
import {
  isSignificantCodeChange,
  addMethodToWhitelist,
  removeMethodFromWhitelist
} from './javaCodeHandler';
import { createEditorDecorators } from './editorDecoratorController';
import { createWebviewOverview, createWebviewHistory } from './webviewController';

const fs = require('fs');

let disposables: vscode.Disposable[] = [];

export let isExtensionEnabled = false;

// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  let disposableCommand = vscode.commands.registerCommand("infer-for-vscode.executeInfer", () => {
    vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: "Executing Infer...",
      cancellable: false
    }, (progress, token) => {
      return new Promise(async resolve => {
        const success = await executeInfer(true);
        isExtensionEnabled = true;
        if (success) {
          vscode.window.showInformationMessage('Infer has been successfully executed.');
        }
        resolve();
      });
    });
  });
  disposables.push(disposableCommand);
  context.subscriptions.push(disposableCommand);

  disposableCommand = vscode.commands.registerCommand("infer-for-vscode.disableInfer", () => {
    isExtensionEnabled = false;
    disableInfer();
  });
  disposables.push(disposableCommand);
  context.subscriptions.push(disposableCommand);

  disposableCommand = vscode.commands.registerCommand("infer-for-vscode.detailCodelensAction", (methodKey: string) => {
    createWebviewHistory(methodKey);
  });
  disposables.push(disposableCommand);
  context.subscriptions.push(disposableCommand);

  disposableCommand = vscode.commands.registerCommand("infer-for-vscode.detailCodelensError", () => {
    vscode.window.showInformationMessage("Please save and re-execute Infer.");
  });
  disposables.push(disposableCommand);
  context.subscriptions.push(disposableCommand);

  disposableCommand = vscode.commands.registerCommand("infer-for-vscode.overviewCodelensAction", (selectedMethodName: string) => {
    createWebviewOverview(selectedMethodName);
  });
  disposables.push(disposableCommand);
  context.subscriptions.push(disposableCommand);

  disposableCommand = vscode.commands.registerCommand("infer-for-vscode.addMethodToWhitelist", async () => {
    const methodName = (await vscode.window.showInputBox({ prompt: 'Enter name of method that should not trigger re-execution of Infer.', placeHolder: "e.g. cheapMethod" }))?.trim();
    if (methodName) {
      addMethodToWhitelist(methodName);
    }
  });
  disposables.push(disposableCommand);
  context.subscriptions.push(disposableCommand);

  disposableCommand = vscode.commands.registerCommand("infer-for-vscode.removeMethodFromWhitelist", async () => {
    const methodName = (await vscode.window.showInputBox({ prompt: 'Enter name of method that should be removed from the whitelist.', placeHolder: "e.g. expensiveMethod" }))?.trim();
    if (methodName) {
      removeMethodFromWhitelist(methodName);
    }
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
    if (isExtensionEnabled &&
        isSignificantCodeChange(event.getText())) {

      vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Automatic re-execution of Infer...",
        cancellable: false
      }, (progress, token) => {
        return new Promise(async resolve => {
          const success = await executeInfer(false);
          if (success) {
            vscode.window.showInformationMessage('Infer has been successfully re-executed.');
          }
          resolve();
        });
      });
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