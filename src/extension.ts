import * as vscode from 'vscode';
import { ExecutionMode, EnableMode } from './types';
import { validateBuildCommand, isInferInstalled, validateClassesFolder } from './validators';
import {
  inferCosts,
  executeInfer,
  enableInfer,
  readInferOut,
  disableInfer,
  setCurrentInferCost,
  setActiveTextEditor,
  updateSavedDocumentText,
  activeTextEditor,
  savedDocumentTexts,
  getCurrentWorkspaceFolder,
  getSourceFileName
} from './inferController';
import { significantCodeChangeCheck } from './javaCodeHandler';
import { createEditorDecorators } from './editorDecoratorController';
import { createWebviewOverview, createWebviewHistory } from './webview/webviewController';
import { hasFileCodeLenses, createCodeLenses } from './codeLens/codelensController';

const fs = require('fs');

let disposables: vscode.Disposable[] = [];  // Commands that get disposed when deactivating the extension.

export let isExtensionEnabled = false;
export let executionMode: ExecutionMode;    // 'Project' or 'File'

// Called when the extension is activated.
export function activate(context: vscode.ExtensionContext) {

  // Re-run Infer analysis on current project or file, depending on executionMode.
  let disposableCommand = vscode.commands.registerCommand("performance-by-infer.reExecute", () => {
    if (!isExtensionEnabled) {
      vscode.window.showInformationMessage("Please enable Infer before re-executing.");
      return;
    }
    showExecutionProgress(executeInfer, "Executing Infer...");
  });
  disposables.push(disposableCommand);
  context.subscriptions.push(disposableCommand);

  // Re-run analysis on single file within a project (like re-execution on current file, but within executionMode 'Project').
  disposableCommand = vscode.commands.registerCommand("performance-by-infer.reExecuteForFileWithinProject", async () => {
    if (!isExtensionEnabled) {
      vscode.window.showInformationMessage("Please enable Infer before re-executing.");
      return;
    }
    if (executionMode === ExecutionMode.File) {
      vscode.window.showInformationMessage("Infer is not enabled for a project.");
      return;
    }

    // Necessary for re-compilation of file with dependencies within the current project. For Maven for example, this could
    // be something like 'target/classes'.
    let classesFolder: string | undefined = vscode.workspace.getConfiguration('performance-by-infer').get('classesFolder');
    if (!classesFolder) {
      classesFolder = (await vscode.window.showInputBox({ prompt: 'Specify the root package folder containing the compiled files.', placeHolder: "e.g. target/classes, build/classes/main, etc.", ignoreFocusOut: true }))?.trim();
      if (classesFolder && validateClassesFolder(classesFolder)) {
        vscode.workspace.getConfiguration('performance-by-infer').update('classesFolder', classesFolder, true);
      } else {
        vscode.window.showErrorMessage("Invalid path entered. Please give the relative path from your project root.");
        return;
      }
    }

    showExecutionProgress(async () => { return await executeInfer(classesFolder); }, "Executing Infer...");
  });
  disposables.push(disposableCommand);
  context.subscriptions.push(disposableCommand);

  // Enable the extension for the currently open project in VSCode.
  disposableCommand = vscode.commands.registerCommand("performance-by-infer.enableForProject", async () => {
    if (!await isInferInstalled()) {
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

    // Custom build command for the project (e.g. 'mvn compile').
    let buildCommand: string | undefined = vscode.workspace.getConfiguration('performance-by-infer').get('buildCommand');
    if (!buildCommand) {
      buildCommand = (await vscode.window.showInputBox({ prompt: 'Enter the build command for your project.', placeHolder: "e.g. mvn compile, ./gradlew build, etc.", ignoreFocusOut: true }))?.trim();
      if (buildCommand && validateBuildCommand(buildCommand)) {
        vscode.workspace.getConfiguration('performance-by-infer').update('buildCommand', buildCommand, true);
      } else {
        vscode.window.showErrorMessage("Invalid build command entered. Currently supported build tools: javac, maven, gradle");
        return;
      }
    }

    // Allows the user to decide whether to load the most recently used performance data, read it from the 'infer-out' folder
    // in the project root, or run a fresh analysis.
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

  // Enable the extension for the currently open file.
  disposableCommand = vscode.commands.registerCommand("performance-by-infer.enableForFile", async () => {
    if (!await isInferInstalled()) {
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

    // Allows the user to decide whether to load the most recently used performance data, read it from the 'infer-out' folder
    // in the project root, or run a fresh analysis.
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

  // Runnable when the extension is already enabled. Reads and loads performance data from the 'infer-out' folder in the
  // project root, for example when a fresh analysis has been run outside of the extension.
  disposableCommand = vscode.commands.registerCommand("performance-by-infer.readInferOut", () => {
    if (!isExtensionEnabled) {
      vscode.window.showInformationMessage("Infer is not enabled.");
      return;
    }
    showExecutionProgress(readInferOut, "Reading infer-out folder...");
  });
  disposables.push(disposableCommand);
  context.subscriptions.push(disposableCommand);

  // Disable everything related to the extension (CodeLenses, editor decorations, webviews) and reset all according values.
  // Does NOT deactivate the extension for VSCode.
  disposableCommand = vscode.commands.registerCommand("performance-by-infer.disable", () => {
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

  // Called when CodeLens showing execution cost is clicked. Opens history webview.
  disposableCommand = vscode.commands.registerCommand("performance-by-infer.detailCodelensAction", (methodKey: string) => {
    createWebviewHistory(context.extensionUri, methodKey);
  });
  disposables.push(disposableCommand);
  context.subscriptions.push(disposableCommand);

  // Called when CodeLens showing execution cost is clicked, but no performance data for the function is available.
  disposableCommand = vscode.commands.registerCommand("performance-by-infer.detailCodelensError", () => {
    vscode.window.showInformationMessage("Re-execute Infer to get fresh performance data.");
  });
  disposables.push(disposableCommand);
  context.subscriptions.push(disposableCommand);

  // Called when CodeLens for overview is clicked. Opens overview webview.
  disposableCommand = vscode.commands.registerCommand("performance-by-infer.overviewCodelensAction", (selectedMethodName: string, selectedMethodParameters: string[]) => {
    createWebviewOverview(context.extensionUri, selectedMethodName, selectedMethodParameters);
  });
  disposables.push(disposableCommand);
  context.subscriptions.push(disposableCommand);

  // Updates the extension accordingly when another file is opened, in case performance data is available for it.
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

  // Checks for significant code changes whenever the currently active file is saved.
  vscode.workspace.onDidSaveTextDocument(document => {
    if (document === activeTextEditor.document &&
        isExtensionEnabled &&
        inferCosts.get(activeTextEditor.document.fileName) &&
        significantCodeChangeCheck(document.getText())) {

      if (vscode.workspace.getConfiguration('performance-by-infer').get('automaticReExecution', false)) {
        showExecutionProgress(executeInfer, "Automatic re-execution of Infer...");
      }
    }
  }, null, context.subscriptions);
}

// Called when the extension is deactivated.
export function deactivate() {
  disableInfer();
  if (disposables) {
    disposables.forEach(item => item.dispose());
  }
  disposables = [];
}

// Shows an execution notification in VSCode when the executionFunction is called.
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
