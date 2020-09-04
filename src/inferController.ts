import * as vscode from 'vscode';
import { InferCostItem, ExecutionMode } from './types';
import { executionMode } from './extension';
import {
  findMethodDeclarations,
  constantMethods,
  resetConstantMethods,
  removeConstantMethods,
  resetSignificantlyChangedMethods,
  removeSignificantlyChangedMethods
} from './javaCodeHandler';
import {
  costDegreeDecorationTypes,
  initializeNameDecorationTypes,
  createEditorDecorators,
  disposeDecorationTypes
} from './editorDecoratorController';
import { createCodeLenses, disposeCodeLensProviders } from './codeLens/codelensController';
import { disposeWebviews } from './webviewController';

const fs = require('fs');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

export let activeTextEditor: vscode.TextEditor;
export let savedDocumentTexts = new Map<string, string>();        // [document.fileName, text]

export let currentInferCost: InferCostItem[];
export let inferCosts = new Map<string, InferCostItem[]>();          // [inferCostItem.loc.file, inferCost]
export let inferCostHistories = new Map<string, InferCostItem[]>();  // [inferCostItem.id, costHistory]

export function setActiveTextEditor(newActiveTextEditor: vscode.TextEditor) {
  activeTextEditor = newActiveTextEditor;
}
export function setCurrentInferCost(newCurrentInferCost: InferCostItem[]) {
  currentInferCost = newCurrentInferCost;
}

export function updateSavedDocumentText(editor: vscode.TextEditor) {
  savedDocumentTexts.set(editor.document.fileName, editor.document.getText());
}

function updateActiveTextEditorAndSavedDocumentText() {
  const tmpActiveTextEditor = vscode.window.activeTextEditor;
  if (tmpActiveTextEditor) {
    activeTextEditor = tmpActiveTextEditor;
    savedDocumentTexts.set(activeTextEditor.document.fileName, activeTextEditor.document.getText());
    return true;
  } else { return false; }
}

function getSourceFileName(editor: vscode.TextEditor) {
  const sourceFileName = editor.document.fileName.split("/").pop()?.split(".")[0];
  return sourceFileName ? sourceFileName : '';
}

function getCurrentWorkspaceFolder() {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  return workspaceFolders ? workspaceFolders[0].uri.fsPath : '.';
}

export async function executeInfer() {
  savedDocumentTexts.set(activeTextEditor.document.fileName, activeTextEditor.document.getText());

  if (executionMode === ExecutionMode.Project) {
    const buildCommand: string = vscode.workspace.getConfiguration('infer-for-vscode').get('buildCommand', "");
    if (!buildCommand) {
      vscode.window.showErrorMessage("Build command could not be found in VSCode config");
      return;
    }
    if (!await runInferOnProject(buildCommand)) { return; }
  } else if (executionMode === ExecutionMode.File) {
    if (!await runInferOnCurrentFile()) { return; }
  } else { return; }

  createInferAnnotations();

  vscode.window.showInformationMessage("Executed Infer.");
}

export async function executeInferForFileWithinProject() {
  savedDocumentTexts.set(activeTextEditor.document.fileName, activeTextEditor.document.getText());

  const buildCommand: string = vscode.workspace.getConfiguration('infer-for-vscode').get('buildCommand', "");
  if (!buildCommand) {
    vscode.window.showErrorMessage("Build command could not be found in VSCode config");
    return;
  }
  if (!await runInferOnCurrentFileWithinProject(buildCommand)) { return; }

  createInferAnnotations();

  vscode.window.showInformationMessage("Executed Infer.");
}

export async function enableInfer(buildCommand?: string) {
  let wasFreshExecution = true;
  if (!updateActiveTextEditorAndSavedDocumentText()) { return; }

  if (executionMode === ExecutionMode.Project) {
    if (!buildCommand) { return; }
    if (!await readNewInferOutput("infer-out")) {
      if (!await runInferOnProject(buildCommand)) { return; }
    } else {
      wasFreshExecution = false;
    }
  } else if (executionMode === ExecutionMode.File) {
    if (!await readNewInferOutput(`infer-out-${getSourceFileName(activeTextEditor)}`)) {
      if (!await runInferOnCurrentFile()) { return; }
    } else {
      wasFreshExecution = false;
    }
  } else { return; }

  createInferAnnotations();

  vscode.window.showInformationMessage(`Enabled Infer for current ${executionMode === ExecutionMode.Project ? "project" : "file"} (${wasFreshExecution ? "fresh execution" : "read from infer-out"}).`);
}

function createInferAnnotations() {
  if (costDegreeDecorationTypes.length === 0) {
    initializeNameDecorationTypes();
  }

  updateInferCostHistory();
  findMethodDeclarations(activeTextEditor.document);

  createCodeLenses();
  createEditorDecorators();
}

export function disableInfer() {
  disposeDecorationTypes();
  disposeCodeLensProviders();
  disposeWebviews();
  inferCosts = new Map<string, InferCostItem[]>();
  savedDocumentTexts = new Map<string, string>();
}

export function cleanInferOut() {
  const currentWorkspaceFolder = getCurrentWorkspaceFolder();
  fs.readdirSync(currentWorkspaceFolder).forEach((file: string) => {
    const filePath = `${currentWorkspaceFolder}/${file}`;
    if (file.startsWith("infer-out") && fs.statSync(filePath).isDirectory()) {
      vscode.workspace.fs.delete(vscode.Uri.file(filePath), {recursive: true});
    }
  });
}

async function runInferOnProject(buildCommand: string) {
  resetSignificantlyChangedMethods();
  const currentWorkspaceFolder = getCurrentWorkspaceFolder();

  try {
    await exec(`cd ${currentWorkspaceFolder} && infer --cost-only --reactive -- ${buildCommand}`);
  } catch (err) {
    console.log(err);
    vscode.window.showErrorMessage("Execution of Infer failed (possible reasons: invalid build command, compilation error, project folder not opened in VSCode, etc.)");
    return false;
  }

  return await readNewInferOutput("infer-out");
}

async function runInferOnCurrentFileWithinProject(buildCommand: string) {
  const sourceFilePath = activeTextEditor.document.fileName;
  removeSignificantlyChangedMethods();

  if (!sourceFilePath.endsWith(".java")) {
    vscode.window.showInformationMessage('Infer can only be executed on Java files.');
    console.log("Tried to execute Infer on non-Java file.");
    return false;
  }

  const currentWorkspaceFolder = getCurrentWorkspaceFolder();
  try {
    if (buildCommand.startsWith("./gradlew") || buildCommand.startsWith("gradle")) {
      await exec(`cd ${currentWorkspaceFolder} && infer --cost-only -o tmp-infer-out -- javac -cp $CLASSPATH:build/classes/main:build/libs ${sourceFilePath}`);
    } else {
      vscode.window.showErrorMessage("Unsupported build tool for this execution mode");
      return false;
    }
  } catch (err) {
    console.log(err);
    vscode.window.showErrorMessage("Single file execution not supported for this file.");
    return false;
  }

  return await readNewInferOutput("tmp-infer-out", true);
}

async function runInferOnCurrentFile() {
  resetSignificantlyChangedMethods();
  const sourceFilePath = activeTextEditor.document.fileName;

  if (!sourceFilePath.endsWith(".java")) {
    vscode.window.showInformationMessage('Infer can only be executed on Java files.');
    console.log("Tried to execute Infer on non-Java file.");
    return false;
  }

  const currentWorkspaceFolder = getCurrentWorkspaceFolder();
  const inferOutFolder = `infer-out-${getSourceFileName(activeTextEditor)}`;
  try {
    await exec(`infer --cost-only -o ${currentWorkspaceFolder}/${inferOutFolder} -- javac ${sourceFilePath}`);
  } catch (err) {
    console.log(err);
    vscode.window.showErrorMessage("Execution of Infer failed (possibly due to compilation error)");
    return false;
  }

  if (await readNewInferOutput(inferOutFolder)) {
    return true;
  } else {
    return false;
  }
}

async function readNewInferOutput(inferOutFolder: string, isSingleFileWithinProject?: boolean) {
  const currentWorkspaceFolder = getCurrentWorkspaceFolder();

  if (isSingleFileWithinProject) {
    removeConstantMethods();
  } else {
    resetConstantMethods();
  }
  let inferCost: InferCostItem[] = [];
  try {
    const inferCostJsonString = await fs.promises.readFile(`${currentWorkspaceFolder}/${inferOutFolder}/costs-report.json`);
    if (isSingleFileWithinProject) {
      vscode.workspace.fs.delete(vscode.Uri.file(`${currentWorkspaceFolder}/${inferOutFolder}`), {recursive: true});
    }
    let inferCostRaw = JSON.parse(inferCostJsonString);
    for (let inferCostRawItem of inferCostRaw) {
      if (inferCostRawItem.procedure_name === "<init>") {
        continue;
      }
      if (+inferCostRawItem.exec_cost.hum.hum_degree === 0) {
        constantMethods.push(inferCostRawItem.procedure_name);
      }
      inferCost.push({
        id: inferCostRawItem.procedure_id,
        method_name: inferCostRawItem.procedure_name,
        loc: {
          file: executionMode === ExecutionMode.Project ? `${currentWorkspaceFolder}/${inferCostRawItem.loc.file}` : activeTextEditor.document.fileName,
          lnum: inferCostRawItem.loc.lnum
        },
        alloc_cost: {
          polynomial: inferCostRawItem.alloc_cost.hum.hum_polynomial.replace(/\./g, '*'),
          degree: +inferCostRawItem.alloc_cost.hum.hum_degree,
          big_o: inferCostRawItem.alloc_cost.hum.big_o
        },
        exec_cost: {
          polynomial: inferCostRawItem.exec_cost.hum.hum_polynomial.replace(/\./g, '*'),
          degree: +inferCostRawItem.exec_cost.hum.hum_degree,
          big_o: inferCostRawItem.exec_cost.hum.big_o
        }
      });
    }
  } catch (err) {
    return false;
  }
  if (executionMode === ExecutionMode.Project && !isSingleFileWithinProject) {
    inferCost.sort((a: InferCostItem, b: InferCostItem) => a.loc.file.localeCompare(b.loc.file));
    let sourceFilePath: string | undefined;
    let fileInferCost: InferCostItem[] = [];
    for (const inferCostItem of inferCost) {
      if (sourceFilePath && sourceFilePath !== inferCostItem.loc.file) {
        fileInferCost.sort((a: InferCostItem, b: InferCostItem) => a.loc.lnum - b.loc.lnum);
        inferCosts.set(sourceFilePath, fileInferCost);
        fileInferCost = [inferCostItem];
      } else {
        fileInferCost.push(inferCostItem);
      }
      sourceFilePath = inferCostItem.loc.file;
    }
    const tmpInferCost = inferCosts.get(activeTextEditor.document.fileName);
    if (tmpInferCost) {
      setCurrentInferCost(tmpInferCost);
    } else { return false; }
  } else {
    setCurrentInferCost(inferCost.sort((a: InferCostItem, b: InferCostItem) => a.loc.lnum - b.loc.lnum));
    inferCosts.set(activeTextEditor.document.fileName, currentInferCost);
  }

  if (!isSingleFileWithinProject) {
    // write
  } else {
    // write
  }

  return true;
}

function updateInferCostHistory() {
  let currentTime = new Date().toLocaleString('en-US', { hour12: false });
  for (const inferCost of inferCosts) {
    for (const inferCostItem of inferCost[1]) {
      let costHistory: InferCostItem[] | undefined = [];
      if (inferCostHistories.has(inferCostItem.id)) {
        costHistory = inferCostHistories.get(inferCostItem.id);
      }
      if (!costHistory) { return; }
      if ((costHistory.length > 0) && (costHistory[0].exec_cost.polynomial === inferCostItem.exec_cost.polynomial)) {
        continue;
      }
      inferCostItem.timestamp = currentTime;
      costHistory.unshift(inferCostItem);
      inferCostHistories.set(inferCostItem.id, costHistory);
    }
  }
}