import * as vscode from 'vscode';
import { InferCostItem } from './types';
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
export let activeTextEditorTexts = new Map<string, string>();        // [document.fileName, text]

export let currentInferCost: InferCostItem[];
export let inferCosts = new Map<string, InferCostItem[]>();          // [sourceFileName, inferCost]
export let inferCostHistories = new Map<string, InferCostItem[]>();  // [inferCostItem.id, costHistory]

export function setActiveTextEditor(newActiveTextEditor: vscode.TextEditor) {
  activeTextEditor = newActiveTextEditor;
}
export function setCurrentInferCost(newCurrentInferCost: InferCostItem[]) {
  currentInferCost = newCurrentInferCost;
}

function updateActiveTextEditorAndTexts() {
  const tmpActiveTextEditor = vscode.window.activeTextEditor;
  if (tmpActiveTextEditor) {
    activeTextEditor = tmpActiveTextEditor;
    activeTextEditorTexts.set(activeTextEditor.document.fileName, activeTextEditor.document.getText());
    return true;
  } else { return false; }
}

export function getSourceFileName(editor: vscode.TextEditor) {
  const sourceFileName = editor.document.fileName.split("/").pop()?.split(".")[0];
  return sourceFileName ? sourceFileName : '';
}

function getCurrentWorkspaceFolder() {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  return workspaceFolders ? workspaceFolders[0].uri.fsPath : '.';
}

export async function executeInfer() {
  activeTextEditorTexts.set(activeTextEditor.document.fileName, activeTextEditor.document.getText());

  if (!await runInferOnCurrentFile()) {
    return false;
  }

  updateInferCostHistory();

  if (costDegreeDecorationTypes.length === 0) {
    initializeNameDecorationTypes();
  }

  createCodeLenses();
  createEditorDecorators();

  return true;
}

export async function enableInfer() {
  if (!updateActiveTextEditorAndTexts()) { return false; }

  if (!await readInferOutputForProject()) {
    if (!await runInferOnProject()) { return false; }
  }

  updateInferCostHistory();

  if (costDegreeDecorationTypes.length === 0) {
    initializeNameDecorationTypes();
  }

  createCodeLenses();
  createEditorDecorators();

  return true;
}

export async function enableInferForCurrentFile() {
  if (!updateActiveTextEditorAndTexts()) { return false; }

  if (!await readInferOutputForCurrentFile()) {
    if (!await runInferOnCurrentFile()) { return false; }
  }

  updateInferCostHistory();

  if (costDegreeDecorationTypes.length === 0) {
    initializeNameDecorationTypes();
  }

  createCodeLenses();
  createEditorDecorators();

  return true;
}

export function disableInfer() {
  disposeDecorationTypes();
  disposeCodeLensProviders();
  disposeWebviews();
  inferCosts = new Map<string, InferCostItem[]>();
  activeTextEditorTexts = new Map<string, string>();
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

async function runInferOnProject() {
  // TODO: implementation
  return false;
}

async function readInferOutputForProject() {
  const currentWorkspaceFolder = getCurrentWorkspaceFolder();

  let inferCost: InferCostItem[] = [];
  try {
    const inferCostJsonString = await fs.promises.readFile(`${currentWorkspaceFolder}/infer-out/costs-report.json`);
    let inferCostRaw = JSON.parse(inferCostJsonString);
    let sourceFileName: string;
    for (let inferCostRawItem of inferCostRaw) {
      sourceFileName = inferCostRawItem.loc.file.split("/").pop()?.split(".")[0];
      inferCost.push({
        id: `${sourceFileName}:${inferCostRawItem.procedure_name}`,
        method_name: inferCostRawItem.procedure_name,
        loc: {
          file: inferCostRawItem.loc.file,
          lnum: inferCostRawItem.loc.lnum
        },
        alloc_cost: {
          polynomial: inferCostRawItem.alloc_cost.hum.hum_polynomial.replace(/\./g, '*'),
          degree: inferCostRawItem.alloc_cost.hum.hum_degree,
          big_o: inferCostRawItem.alloc_cost.hum.big_o
        },
        exec_cost: {
          polynomial: inferCostRawItem.exec_cost.hum.hum_polynomial.replace(/\./g, '*'),
          degree: inferCostRawItem.exec_cost.hum.hum_degree,
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

      let sourceFileName = inferCostItem.id.split(":")[0];
      fileInferCost.sort((a: InferCostItem, b: InferCostItem) => a.loc.lnum - b.loc.lnum);
      inferCosts.set(sourceFileName, fileInferCost);
      sourceFilePath = inferCostItem.loc.file;
      fileInferCost = [inferCostItem];
    } else {
      fileInferCost.push(inferCostItem);
    }
  }
  const tmpInferCost = inferCosts.get(getSourceFileName(activeTextEditor));
  if (tmpInferCost) {
    currentInferCost = tmpInferCost;
  } else { return false; }

  return true;
}

async function runInferOnCurrentFile() {
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
    vscode.window.showInformationMessage("Execution of Infer failed (probably due to compilation error).");
    return false;
  }

  if (await readInferOutputForCurrentFile()) {
    return true;
  } else {
    return false;
  }
}

async function readInferOutputForCurrentFile() {
  const sourceFileName = getSourceFileName(activeTextEditor);
  const currentWorkspaceFolder = getCurrentWorkspaceFolder();

  let inferCost: InferCostItem[] = [];
  try {
    const inferCostJsonString = await fs.promises.readFile(`${currentWorkspaceFolder}/infer-out-${sourceFileName}/costs-report.json`);
    let inferCostRaw = JSON.parse(inferCostJsonString);
    for (let inferCostRawItem of inferCostRaw) {
      inferCost.push({
        id: `${sourceFileName}:${inferCostRawItem.procedure_name}`,
        method_name: inferCostRawItem.procedure_name,
        loc: {
          file: inferCostRawItem.loc.file,
          lnum: inferCostRawItem.loc.lnum
        },
        alloc_cost: {
          polynomial: inferCostRawItem.alloc_cost.hum.hum_polynomial.replace(/\./g, '*'),
          degree: inferCostRawItem.alloc_cost.hum.hum_degree,
          big_o: inferCostRawItem.alloc_cost.hum.big_o
        },
        exec_cost: {
          polynomial: inferCostRawItem.exec_cost.hum.hum_polynomial.replace(/\./g, '*'),
          degree: inferCostRawItem.exec_cost.hum.hum_degree,
          big_o: inferCostRawItem.exec_cost.hum.big_o
        }
      });
    }
  } catch (err) {
    return false;
  }
  currentInferCost = inferCost.sort((a: InferCostItem, b: InferCostItem) => a.loc.lnum - b.loc.lnum);
  inferCosts.set(sourceFileName, currentInferCost);
  return true;
}

function updateInferCostHistory() {
  let currentTime = new Date().toLocaleString('en-US', { hour12: false });
  for (const inferCostItem of currentInferCost) {
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