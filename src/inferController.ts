import * as vscode from 'vscode';
import { INFER_OUTPUT_DIRECTORY } from './constants';
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
export let inferCosts = new Map<string, InferCostItem[]>();          // [document.fileName, inferCost]
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
    console.log('test');
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

async function runInferOnCurrentFile(isManualCall: boolean) {
  const sourceFilePath = activeTextEditor.document.fileName;
  if (!sourceFilePath.endsWith(".java")) {
    vscode.window.showInformationMessage('Infer can only be executed on Java files.');
    console.log("Tried to execute Infer on non-Java file.");
    return false;
  }
  const sourceFileName = sourceFilePath.split("/").pop()?.split(".")[0];
  try {
    await exec(`infer --cost-only -o ${INFER_OUTPUT_DIRECTORY}/${sourceFileName} -- javac ${sourceFilePath}`);
  } catch (err) {
    if (isManualCall) {
      vscode.window.showErrorMessage("Execution of Infer failed (probably due to compilation error).");
    } else {
      vscode.window.showErrorMessage("Automatic re-execution of Infer failed (probably due to compilation error).");
    }
    console.log("Execution of infer command failed (probably due to compilation error).");
    return false;
  }

  let inferCost: InferCostItem[] = [];
  try {
    const inferCostJsonString = fs.readFileSync(`${INFER_OUTPUT_DIRECTORY}/${sourceFileName}/costs-report.json`);
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
  } finally {
    if (fs.existsSync(`${INFER_OUTPUT_DIRECTORY}/${sourceFileName}`)) {
      let inferOut = vscode.Uri.file(`${INFER_OUTPUT_DIRECTORY}/${sourceFileName}`);
      vscode.workspace.fs.delete(inferOut, {recursive: true});
    }
  }
  currentInferCost = inferCost.sort((a: InferCostItem, b: InferCostItem) => a.loc.lnum - b.loc.lnum);
  inferCosts.set(sourceFilePath, currentInferCost);
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