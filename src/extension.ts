import * as vscode from 'vscode';
import {
  inferCosts,
  executeInfer,
  enableInfer,
  enableInferForCurrentFile,
  disableInfer,
  cleanInferOut,
  setCurrentInferCost,
  setActiveTextEditor,
  initializeActiveTextEditorTexts,
  activeTextEditor,
  activeTextEditorTexts,
  getSourceFileName
} from './inferController';
import {
  isSignificantCodeChange,
  addMethodToWhitelist,
  removeMethodFromWhitelist
} from './javaCodeHandler';
import { createEditorDecorators } from './editorDecoratorController';
import { createWebviewOverview, createWebviewHistory } from './webviewController';
import { hasFileCodeLenses, createCodeLenses } from './codeLens/codelensController';

const fs = require('fs');

let disposables: vscode.Disposable[] = [];

export let isExtensionEnabled = false;

// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  let disposableCommand = vscode.commands.registerCommand("infer-for-vscode.executeInfer", () => {
    showExecutionProgress(executeInfer, "Infer has been successfully executed.");
  });
  disposables.push(disposableCommand);
  context.subscriptions.push(disposableCommand);

  disposableCommand = vscode.commands.registerCommand("infer-for-vscode.enableInfer", () => {
    showExecutionProgress(enableInfer, "Infer has been enabled.");
  });
  disposables.push(disposableCommand);
  context.subscriptions.push(disposableCommand);

  disposableCommand = vscode.commands.registerCommand("infer-for-vscode.enableInferForCurrentFile", () => {
    showExecutionProgress(enableInferForCurrentFile, "Infer has been enabled for current file.");
  });
  disposables.push(disposableCommand);
  context.subscriptions.push(disposableCommand);

  disposableCommand = vscode.commands.registerCommand("infer-for-vscode.disableInfer", () => {
    isExtensionEnabled = false;
    disableInfer();
  });
  disposables.push(disposableCommand);
  context.subscriptions.push(disposableCommand);

  disposableCommand = vscode.commands.registerCommand("infer-for-vscode.cleanInferOut", () => {
    cleanInferOut();
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
      const tmpInferCost = inferCosts.get(getSourceFileName(editor));
      if (tmpInferCost) {
        setCurrentInferCost(tmpInferCost);
        if (!activeTextEditorTexts.has(editor.document.fileName)) {
          initializeActiveTextEditorTexts(editor);
        }
        if (!hasFileCodeLenses.get(editor.document.fileName)) {
          createCodeLenses();
        }
        createEditorDecorators();
      }
    }
  }, null, context.subscriptions);

  vscode.workspace.onDidSaveTextDocument(document => {
    if (document === activeTextEditor.document &&
        isExtensionEnabled &&
        isSignificantCodeChange(document.getText())) {

      vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Automatic re-execution of Infer...",
        cancellable: false
      }, (progress, token) => {
        return new Promise(async resolve => {
          const success = await executeInfer();
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
  disableInfer();
  if (disposables) {
    disposables.forEach(item => item.dispose());
  }
  disposables = [];
}

function showExecutionProgress(executionFunction: Function, successMessage: string) {
  vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: "Executing Infer...",
    cancellable: false
  }, (progress, token) => {
    return new Promise(async resolve => {
      const success = await executionFunction();
      isExtensionEnabled = true;
      if (success) {
        vscode.window.showInformationMessage(successMessage);
      }
      resolve();
    });
  });
}
