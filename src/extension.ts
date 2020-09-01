import * as vscode from 'vscode';
import { ExecutionMode } from './types';
import { validateBuildCommand } from './validators';
import {
  inferCosts,
  executeInfer,
  enableInfer,
  disableInfer,
  cleanInferOut,
  setCurrentInferCost,
  setActiveTextEditor,
  updateSavedDocumentText,
  activeTextEditor,
  savedDocumentTexts,
} from './inferController';
import {
  significantCodeChangeCheck,
  addMethodToWhitelist,
  removeMethodFromWhitelist,
  findMethodDeclarations
} from './javaCodeHandler';
import { createEditorDecorators } from './editorDecoratorController';
import { createWebviewOverview, createWebviewHistory } from './webviewController';
import { hasFileCodeLenses, createCodeLenses } from './codeLens/codelensController';

const fs = require('fs');

let disposables: vscode.Disposable[] = [];

export let isExtensionEnabled = false;
export let executionMode: ExecutionMode;

// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  let disposableCommand = vscode.commands.registerCommand("infer-for-vscode.execute", () => {
    if (!isExtensionEnabled) {
      vscode.window.showInformationMessage("Please enable Infer before re-executing.");
      return;
    }
    showExecutionProgress(executeInfer, "Executing Infer...");
  });
  disposables.push(disposableCommand);
  context.subscriptions.push(disposableCommand);

  disposableCommand = vscode.commands.registerCommand("infer-for-vscode.enableForProject", async () => {
    if (isExtensionEnabled && executionMode === ExecutionMode.Project) {
      vscode.window.showInformationMessage("Infer is already enabled for current project (use re-execution command to re-execute)");
      return;
    }
    executionMode = ExecutionMode.Project;
    let buildCommand: string | undefined = vscode.workspace.getConfiguration('infer-for-vscode').get('buildCommand');
    if (!buildCommand) {
      buildCommand = (await vscode.window.showInputBox({ prompt: 'Enter the build command for your project.', placeHolder: "e.g. ./gradlew build" }))?.trim();
      if (buildCommand && validateBuildCommand(buildCommand)) {
        vscode.workspace.getConfiguration('infer-for-vscode').update('buildCommand', buildCommand, true);
      } else {
        vscode.window.showErrorMessage("Invalid build command entered. Currently supported build tools: javac, maven, ant, gradle");
        return;
      }
    }
    showExecutionProgress(enableInfer, "Enabling (and executing) Infer...", buildCommand);
  });
  disposables.push(disposableCommand);
  context.subscriptions.push(disposableCommand);

  disposableCommand = vscode.commands.registerCommand("infer-for-vscode.enableForCurrentFile", () => {
    if (isExtensionEnabled && executionMode === ExecutionMode.File) {
      vscode.window.showInformationMessage("Infer is already enabled for current file (use re-execution command to re-execute)");
      return;
    }
    executionMode = ExecutionMode.File;
    showExecutionProgress(enableInfer, "Enabling (and executing) Infer...");
  });
  disposables.push(disposableCommand);
  context.subscriptions.push(disposableCommand);

  disposableCommand = vscode.commands.registerCommand("infer-for-vscode.disable", () => {
    if (!isExtensionEnabled) {
      vscode.window.showInformationMessage("Infer is not enabled.");
      return;
    }
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

  vscode.window.onDidChangeActiveTextEditor(editor => {
    if (editor) {
      setActiveTextEditor(editor);
      const tmpInferCost = inferCosts.get(activeTextEditor.document.fileName);
      if (tmpInferCost) {
        setCurrentInferCost(tmpInferCost);
        if (!savedDocumentTexts.has(editor.document.fileName)) {
          updateSavedDocumentText(editor);
        }
        findMethodDeclarations(editor.document);
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
        significantCodeChangeCheck(document.getText())) {

      if (vscode.workspace.getConfiguration('infer-for-vscode').get('automaticReExecution', false)) {
        showExecutionProgress(executeInfer, "Automatic re-execution of Infer...");
      }
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

function showExecutionProgress(executionFunction: Function, titleMessage: string, buildCommand?: string) {
  vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: titleMessage,
    cancellable: false
  }, () => {
    return new Promise(async resolve => {
      if (buildCommand) {
        await executionFunction(buildCommand);
      } else {
        await executionFunction();
      }
      isExtensionEnabled = true;
      resolve();
    });
  });
}
