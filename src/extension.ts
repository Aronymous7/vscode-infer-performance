import * as vscode from 'vscode';
import { ExecutionMode, EnableMode } from './types';
import { validateBuildCommand, checkInferVersion, validateClassesFolder } from './validators';
import {
  inferCosts,
  executeInfer,
  enableInfer,
  readInferOut,
  disableInfer,
  cleanInferOut,
  setCurrentInferCost,
  setActiveTextEditor,
  updateSavedDocumentText,
  activeTextEditor,
  savedDocumentTexts,
  getCurrentWorkspaceFolder,
  getSourceFileName,
  setInferVersion,
  inferVersion
} from './inferController';
import {
  significantCodeChangeCheck,
  addMethodToWhitelist,
  removeMethodFromWhitelist,
} from './javaCodeHandler';
import { createEditorDecorators } from './editorDecoratorController';
import { createWebviewOverview, createWebviewHistory } from './webviewController';
import { hasFileCodeLenses, createCodeLenses } from './codeLens/codelensController';

const fs = require('fs');

let disposables: vscode.Disposable[] = [];

export let isExtensionEnabled = false;
export let executionMode: ExecutionMode;

export function activate(context: vscode.ExtensionContext) {
  let disposableCommand = vscode.commands.registerCommand("infer-for-vscode.reExecute", () => {
    if (!isExtensionEnabled) {
      vscode.window.showInformationMessage("Please enable Infer before re-executing.");
      return;
    }
    showExecutionProgress(executeInfer, "Executing Infer...");
  });
  disposables.push(disposableCommand);
  context.subscriptions.push(disposableCommand);

  disposableCommand = vscode.commands.registerCommand("infer-for-vscode.reExecuteForFileWithinProject", async () => {
    if (!isExtensionEnabled) {
      vscode.window.showInformationMessage("Please enable Infer before re-executing.");
      return;
    }
    if (executionMode === ExecutionMode.File) {
      vscode.window.showInformationMessage("Infer is not enabled for a project.");
      return;
    }

    let classesFolder: string | undefined = vscode.workspace.getConfiguration('infer-for-vscode').get('classesFolder');
    if (!classesFolder) {
      classesFolder = (await vscode.window.showInputBox({ prompt: 'Specify the root package folder containing the compiled files.', placeHolder: "e.g. target/classes, build/classes/main, etc.", ignoreFocusOut: true }))?.trim();
      if (classesFolder && validateClassesFolder(classesFolder)) {
        vscode.workspace.getConfiguration('infer-for-vscode').update('classesFolder', classesFolder, true);
      } else {
        vscode.window.showErrorMessage("Invalid path entered. Please give the relative path from your project root.");
        return;
      }
    }

    showExecutionProgress(async () => { return await executeInfer(classesFolder); }, "Executing Infer...");
  });
  disposables.push(disposableCommand);
  context.subscriptions.push(disposableCommand);

  disposableCommand = vscode.commands.registerCommand("infer-for-vscode.enableForProject", async () => {
    setInferVersion(await checkInferVersion());
    if (inferVersion < 0) {
      vscode.window.showErrorMessage("Infer is not installed on your system.");
      return;
    }

    if (isExtensionEnabled && executionMode === ExecutionMode.Project) {
      vscode.window.showInformationMessage("Infer is already enabled for current project (use re-execution command to re-execute)");
      return;
    } else if (isExtensionEnabled && executionMode === ExecutionMode.File) {
      disableInfer();
    }
    executionMode = ExecutionMode.Project;

    let buildCommand: string | undefined = vscode.workspace.getConfiguration('infer-for-vscode').get('buildCommand');
    if (!buildCommand) {
      buildCommand = (await vscode.window.showInputBox({ prompt: 'Enter the build command for your project.', placeHolder: "e.g. mvn compile, ./gradlew build, etc.", ignoreFocusOut: true }))?.trim();
      if (buildCommand && validateBuildCommand(buildCommand)) {
        vscode.workspace.getConfiguration('infer-for-vscode').update('buildCommand', buildCommand, true);
      } else {
        vscode.window.showErrorMessage("Invalid build command entered. Currently supported build tools: javac, maven, gradle");
        return;
      }
    }

    let quickPickArray: string[] = ["Fresh execution (make sure to clean the project before)"];
    const currentWorkspaceFolder = getCurrentWorkspaceFolder();
    try {
      await fs.promises.access(`${currentWorkspaceFolder}/infer-out`);
      quickPickArray.unshift("Read from infer-out");
    } catch (err) {}
    try {
      await fs.promises.access(`${currentWorkspaceFolder}/infer-out-vscode/project-costs.json`);
      quickPickArray.unshift("Load most recent performance data (infer-out-vscode)");
    } catch (err) {}

    const enableModeString = await vscode.window.showQuickPick(quickPickArray, {placeHolder: "What performance data should be used?"});
    if (!enableModeString) {
      vscode.window.showInformationMessage("Please choose one of the options.");
      return;
    }

    const enableMode = enableModeString.startsWith("Load") ? EnableMode.LoadRecentData :
                      (enableModeString.startsWith("Read") ? EnableMode.ReadInferOut : EnableMode.FreshExecution);

    showExecutionProgress(async () => { return await enableInfer(enableMode, buildCommand); },
                          enableMode === EnableMode.FreshExecution ? "Enabling and executing Infer..." : "Enabling Infer...");
  });
  disposables.push(disposableCommand);
  context.subscriptions.push(disposableCommand);

  disposableCommand = vscode.commands.registerCommand("infer-for-vscode.enableForFile", async () => {
    setInferVersion(await checkInferVersion());
    if (inferVersion < 0) {
      vscode.window.showErrorMessage("Infer is not installed on your system.");
      return;
    }

    if (isExtensionEnabled && executionMode === ExecutionMode.File) {
      vscode.window.showInformationMessage("Infer is already enabled for current file (use re-execution command to re-execute)");
      return;
    } else if (isExtensionEnabled && executionMode === ExecutionMode.Project) {
      disableInfer();
    }
    executionMode = ExecutionMode.File;

    let quickPickArray: string[] = ["Fresh execution"];
    const currentWorkspaceFolder = getCurrentWorkspaceFolder();
    let sourceFileName = "";
    if (vscode.window.activeTextEditor) {
      sourceFileName = getSourceFileName(vscode.window.activeTextEditor);
    }
    try {
      await fs.promises.access(`${currentWorkspaceFolder}/infer-out`);
      quickPickArray.unshift("Read from infer-out");
    } catch (err) {}
    try {
      await fs.promises.access(`${currentWorkspaceFolder}/infer-out-vscode/file-${sourceFileName}-costs.json`);
      quickPickArray.unshift("Load most recent performance data (infer-out-vscode)");
    } catch (err) {}

    const enableModeString = await vscode.window.showQuickPick(quickPickArray, {placeHolder: "What performance data should be used?"});
    if (!enableModeString) {
      vscode.window.showInformationMessage("Please choose one of the options.");
      return;
    }

    const enableMode = enableModeString.startsWith("Load") ? EnableMode.LoadRecentData :
                      (enableModeString.startsWith("Read") ? EnableMode.ReadInferOut : EnableMode.FreshExecution);

    showExecutionProgress(async () => { return await enableInfer(enableMode); },
                          enableMode === EnableMode.FreshExecution ? "Enabling and executing Infer..." : "Enabling Infer...");
  });
  disposables.push(disposableCommand);
  context.subscriptions.push(disposableCommand);

  disposableCommand = vscode.commands.registerCommand("infer-for-vscode.readInferOut", () => {
    if (!isExtensionEnabled) {
      vscode.window.showInformationMessage("Infer is not enabled.");
      return;
    }
    showExecutionProgress(readInferOut, "Reading infer-out folder...");
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
    vscode.window.showInformationMessage("Infer disabled.");
  });
  disposables.push(disposableCommand);
  context.subscriptions.push(disposableCommand);

  disposableCommand = vscode.commands.registerCommand("infer-for-vscode.cleanInferOut", () => {
    cleanInferOut();
  });
  disposables.push(disposableCommand);
  context.subscriptions.push(disposableCommand);

  disposableCommand = vscode.commands.registerCommand("infer-for-vscode.addMethodToWhitelist", async () => {
    const methodName = (await vscode.window.showInputBox({ prompt: 'Enter name of method that should not trigger re-execution of Infer.', placeHolder: "e.g. cheapMethod", ignoreFocusOut: true }))?.trim();
    if (methodName) {
      addMethodToWhitelist(methodName);
    }
  });
  disposables.push(disposableCommand);
  context.subscriptions.push(disposableCommand);

  disposableCommand = vscode.commands.registerCommand("infer-for-vscode.removeMethodFromWhitelist", async () => {
    const methodName = (await vscode.window.showInputBox({ prompt: 'Enter name of method that should be removed from the whitelist.', placeHolder: "e.g. expensiveMethod", ignoreFocusOut: true }))?.trim();
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
    vscode.window.showInformationMessage("Re-execute Infer to get fresh performance data.");
  });
  disposables.push(disposableCommand);
  context.subscriptions.push(disposableCommand);

  disposableCommand = vscode.commands.registerCommand("infer-for-vscode.overviewCodelensAction", (selectedMethodName: string, selectedMethodParameters: string[]) => {
    createWebviewOverview(selectedMethodName, selectedMethodParameters);
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
        significantCodeChangeCheck(editor.document.getText());
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
        inferCosts.get(activeTextEditor.document.fileName) &&
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

function showExecutionProgress(executionFunction: Function, titleMessage: string) {
  vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: titleMessage,
    cancellable: false
  }, () => {
    return new Promise(async resolve => {
      let success: boolean;
      success = await executionFunction();
      if (success) {
        isExtensionEnabled = true;
      }
      resolve();
    });
  });
}
