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

export async function executeInfer(isManualCall: boolean) {
  const tmpActiveTextEditor = vscode.window.activeTextEditor;
  if (tmpActiveTextEditor) {
    activeTextEditor = tmpActiveTextEditor;
    activeTextEditorTexts.set(activeTextEditor.document.fileName, activeTextEditor.document.getText());
  } else { return false; }

  if (!await runInferOnCurrentFile(isManualCall)) {
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
  // TODO: set active text editor etc.
  const currentWorkspaceFolder = getCurrentWorkspaceFolder();
  try {
    const inferCostJsonString = await fs.promises.readFile(`${currentWorkspaceFolder}/infer-out/costs-report.json`);
    let inferCostRaw = JSON.parse(inferCostJsonString);
    // TODO
    console.log('infer-out found');
  } catch (err) {
    console.log('infer-out not found');
    runInferOnProject();
  }
}

export async function enableInferForCurrentFile() {
  const tmpActiveTextEditor = vscode.window.activeTextEditor;
  if (tmpActiveTextEditor) {
    activeTextEditor = tmpActiveTextEditor;
    activeTextEditorTexts.set(activeTextEditor.document.fileName, activeTextEditor.document.getText());
  } else { return false; }

  const currentWorkspaceFolder = getCurrentWorkspaceFolder();
  const pureSourceFileName = getSourceFileName(activeTextEditor).split(".")[0];
  try {
    const inferCostJsonString = await fs.promises.readFile(`${currentWorkspaceFolder}/infer-out-${pureSourceFileName}/costs-report.json`);
    let inferCostRaw = JSON.parse(inferCostJsonString);
    // TODO
    console.log('infer-out found');
  } catch (err) {
    console.log('infer-out not found');
    if (!await runInferOnCurrentFile(true)) {
      return false;
    }

    updateInferCostHistory();

    if (costDegreeDecorationTypes.length === 0) {
      initializeNameDecorationTypes();
    }

    createCodeLenses();
    createEditorDecorators();
  }
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

export function getSourceFileName(editor: vscode.TextEditor) {
  const sourceFileName = editor.document.fileName.split("/").pop();
  return sourceFileName ? sourceFileName : '';
}

function getCurrentWorkspaceFolder() {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  return workspaceFolders ? workspaceFolders[0].uri.fsPath : '.';
}

async function runInferOnProject() {
  // TODO: implementation
}

async function runInferOnCurrentFile(isManualCall: boolean) {
  const sourceFilePath = activeTextEditor.document.fileName;
  if (!sourceFilePath.endsWith(".java")) {
    vscode.window.showInformationMessage('Infer can only be executed on Java files.');
    console.log("Tried to execute Infer on non-Java file.");
    return false;
  }
  const sourceFileName = getSourceFileName(activeTextEditor);
  const pureSourceFileName = sourceFileName.split(".")[0];
  const currentWorkspaceFolder = getCurrentWorkspaceFolder();
  try {
    await exec(`infer --cost-only -o ${currentWorkspaceFolder}/infer-out-${pureSourceFileName} -- javac ${sourceFilePath}`);
  } catch (err) {
    if (isManualCall) {
      vscode.window.showInformationMessage("Execution of Infer failed (probably due to compilation error).");
    } else {
      vscode.window.showInformationMessage("Automatic re-execution of Infer failed (probably due to compilation error).");
    }
    console.log("Execution of infer command failed (probably due to compilation error).");
    return false;
  }

  let inferCost: InferCostItem[] = [];
  try {
    const inferCostJsonString = await fs.promises.readFile(`${currentWorkspaceFolder}/infer-out-${pureSourceFileName}/costs-report.json`);
    let inferCostRaw = JSON.parse(inferCostJsonString);
    for (let inferCostRawItem of inferCostRaw) {
      inferCost.push({
        id: `${sourceFilePath}:${inferCostRawItem.procedure_name}`,
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
    console.log(err);
    console.log("InferCost file could not be read.");
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