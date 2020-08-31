import * as vscode from 'vscode';
import { InferCostItem, ExecutionMode } from './types';
import { executionMode } from './extension';
import {
  findMethodDeclarations,
  constantMethods,
  resetConstantMethods,
  resetSignificantlyChangedMethods
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
      return false;
    }
    if (!await runInferOnProject(buildCommand)) { return false; }
  } else if (executionMode === ExecutionMode.File) {
    if (!await runInferOnCurrentFile()) { return false; }
  } else { return false; }

  createInferAnnotations();

  return true;
}

export async function enableInfer(buildCommand?: string) {
  if (!updateActiveTextEditorAndSavedDocumentText()) { return false; }

  if (executionMode === ExecutionMode.Project) {
    if (!buildCommand) { return false; }
    if (!await readInferOutputForProject()) {
      if (!await runInferOnProject(buildCommand)) { return false; }
    }
  } else if (executionMode === ExecutionMode.File) {
    if (!await readInferOutputForCurrentFile()) {
      if (!await runInferOnCurrentFile()) { return false; }
    }
  } else { return false; }

  createInferAnnotations();

  return true;
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

  if (await readInferOutputForProject()) {
    return true;
  } else {
    return false;
  }
}

async function runInferOnCurrentFile() {
  resetSignificantlyChangedMethods();
  const sourceFilePath = activeTextEditor.document.fileName;

  if (!sourceFilePath.endsWith(".java")) {
    vscode.window.showInformationMessage('Infer can only be executed on Java files.');
    console.log("Tried to execute Infer on non-Java file.");
    return false;
  }

  const sourceFileName = getSourceFileName(activeTextEditor);
  const currentWorkspaceFolder = getCurrentWorkspaceFolder();
  try {
    await exec(`infer --cost-only -o ${currentWorkspaceFolder}/infer-out-${sourceFileName} -- javac ${sourceFilePath}`);
  } catch (err) {
    console.log(err);
    vscode.window.showErrorMessage("Execution of Infer failed (possibly due to compilation error)");
    return false;
  }

  if (await readInferOutputForCurrentFile()) {
    return true;
  } else {
    return false;
  }
}

async function readInferOutputForProject() {
  const currentWorkspaceFolder = getCurrentWorkspaceFolder();

  resetConstantMethods();
  let inferCost: InferCostItem[] = [];
  try {
    const inferCostJsonString = await fs.promises.readFile(`${currentWorkspaceFolder}/infer-out/costs-report.json`);
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
          file: `${currentWorkspaceFolder}/${inferCostRawItem.loc.file}`,
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

  return true;
}

async function readInferOutputForCurrentFile() {
  const sourceFileName = getSourceFileName(activeTextEditor);
  const currentWorkspaceFolder = getCurrentWorkspaceFolder();

  resetConstantMethods();
  let inferCost: InferCostItem[] = [];
  try {
    const inferCostJsonString = await fs.promises.readFile(`${currentWorkspaceFolder}/infer-out-${sourceFileName}/costs-report.json`);
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
          file: activeTextEditor.document.fileName,
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
  setCurrentInferCost(inferCost.sort((a: InferCostItem, b: InferCostItem) => a.loc.lnum - b.loc.lnum));
  inferCosts.set(activeTextEditor.document.fileName, currentInferCost);
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