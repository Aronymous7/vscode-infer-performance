import * as vscode from 'vscode';
import { InferCostItem, ExecutionMode, EnableMode, TraceItem } from './types';
import { executionMode } from './extension';
import {
  nonConstantMethods,
  resetNonConstantMethods,
  resetNonConstantMethodsForFile
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

export function getSourceFileName(editor: vscode.TextEditor) {
  const sourceFileName = editor.document.fileName.split("/").pop()?.split(".")[0];
  return sourceFileName ? sourceFileName : '';
}

export function getCurrentWorkspaceFolder() {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  return workspaceFolders ? workspaceFolders[0].uri.fsPath : '.';
}

export async function executeInfer(classesFolder?: string) {
  if (executionMode === ExecutionMode.Project) {
    if (!classesFolder) {
      const buildCommand: string = vscode.workspace.getConfiguration('infer-for-vscode').get('buildCommand', "");
      if (!buildCommand) {
        vscode.window.showErrorMessage("Build command could not be found in VSCode config");
        return false;
      }
      if (!await runInferOnProject(buildCommand)) { return false; }
      savedDocumentTexts = new Map<string, string>();
      disposeCodeLensProviders();
    } else {
      if (!await runInferOnCurrentFile(classesFolder)) { return false; }
    }
  } else if (executionMode === ExecutionMode.File) {
    if (!await runInferOnCurrentFile()) { return false; }
  } else { return false; }

  updateSavedDocumentText(activeTextEditor);
  createInferAnnotations();

  vscode.window.showInformationMessage("Executed Infer.");
  return true;
}

export async function enableInfer(enableMode: EnableMode, buildCommand?: string) {
  if (!updateActiveTextEditorAndSavedDocumentText()) { return false; }

  if (executionMode === ExecutionMode.Project) {
    if (!buildCommand) { return false; }
    if (enableMode === EnableMode.LoadRecentData) {
      if (!await readInferCostsReport("project-costs.json")) { return false; }
    } else if (enableMode === EnableMode.ReadInferOut) {
      if (!await readRawInferOutput("infer-out")) { return false; }
    } else {
      if (!await runInferOnProject(buildCommand)) { return false; }
    }
  } else if (executionMode === ExecutionMode.File) {
    if (enableMode === EnableMode.LoadRecentData) {
      if (!await readInferCostsReport(`file-${getSourceFileName(activeTextEditor)}-costs.json`)) { return false; }
    } else if (enableMode === EnableMode.ReadInferOut) {
      if (!await readRawInferOutput("infer-out")) { return false; }
    } else {
      if (!await runInferOnCurrentFile()) { return false; }
    }
  } else { return false; }

  createInferAnnotations();

  vscode.window.showInformationMessage(`Enabled Infer for current ${executionMode === ExecutionMode.Project ? "project" : "file"}.`);
  return true;
}

export async function readInferOut() {
  if (!await readRawInferOutput("infer-out")) {
    vscode.window.showErrorMessage("infer-out folder not found in project root.");
    return false;
  }

  savedDocumentTexts = new Map<string, string>();
  updateSavedDocumentText(activeTextEditor);
  disposeCodeLensProviders();
  createInferAnnotations();

  vscode.window.showInformationMessage("Loaded data from infer-out.");
  return true;
}

function createInferAnnotations() {
  if (costDegreeDecorationTypes.length === 0) {
    initializeNameDecorationTypes();
  }

  updateInferCostHistory();

  createCodeLenses();
  createEditorDecorators();
}

export function disableInfer() {
  disposeDecorationTypes();
  disposeCodeLensProviders();
  disposeWebviews();
  resetNonConstantMethods();
  inferCosts = new Map<string, InferCostItem[]>();
  savedDocumentTexts = new Map<string, string>();
}

async function runInferOnProject(buildCommand: string) {
  const currentWorkspaceFolder = getCurrentWorkspaceFolder();
  try {
    await exec(`cd ${currentWorkspaceFolder} && infer -o infer-out-vscode/project-raw --cost-only --keep-going --reactive --continue -- ${buildCommand}`);
  } catch (err) {
    vscode.workspace.fs.delete(vscode.Uri.file(`${currentWorkspaceFolder}/infer-out-vscode/project-raw`), {recursive: true});
    console.log(err);
    vscode.window.showErrorMessage("Execution of Infer failed (possible reasons: invalid build command, compilation error, project folder not opened in VSCode, etc.)");
    return false;
  }

  try {
    await fs.promises.access(`${currentWorkspaceFolder}/infer-out-vscode/classes`);
    vscode.workspace.fs.delete(vscode.Uri.file(`${currentWorkspaceFolder}/infer-out-vscode/classes`), {recursive: true});
  } catch (err) {}

  return await readRawInferOutput("infer-out-vscode/project-raw");
}

async function runInferOnCurrentFile(classesFolder?: string) {
  const sourceFilePath = activeTextEditor.document.fileName;

  if (!sourceFilePath.endsWith(".java")) {
    vscode.window.showErrorMessage('Infer can only be executed on Java files.');
    return false;
  }

  const currentWorkspaceFolder = getCurrentWorkspaceFolder();
  const inferOutRawFolder = `infer-out-vscode/file-${getSourceFileName(activeTextEditor)}-raw`;

  try {
    if (classesFolder) {
      try {
        await fs.promises.access(`${currentWorkspaceFolder}/${classesFolder}`);
      } catch {
        vscode.window.showErrorMessage("Given folder for compiled files couldn't be found.");
        return false;
      }
      try {
        await fs.promises.access(`${currentWorkspaceFolder}/infer-out-vscode/classes`);
      } catch (err) {
        await fs.promises.mkdir(`${currentWorkspaceFolder}/infer-out-vscode/classes`);
      }
      await exec(`cd ${currentWorkspaceFolder} && infer --cost-only -o ${inferOutRawFolder} -- javac -cp infer-out-vscode/classes:${classesFolder}:build/libs:$CLASSPATH -d infer-out-vscode/classes ${sourceFilePath}`);
    } else {
      await exec(`cd ${currentWorkspaceFolder} && infer --cost-only -o ${inferOutRawFolder} -- javac ${sourceFilePath}`);
    }
  } catch (err) {
    vscode.workspace.fs.delete(vscode.Uri.file(`${currentWorkspaceFolder}/${inferOutRawFolder}`), {recursive: true});
    console.log(err);
    if (classesFolder) {
      vscode.window.showErrorMessage("Single file execution not supported for this file.");
    } else {
      vscode.window.showErrorMessage("Execution of Infer failed (possibly due to compilation error)");
    }
    return false;
  }

  if (classesFolder) {
    return await readRawInferOutput(inferOutRawFolder, true);
  } else {
    return await readRawInferOutput(inferOutRawFolder);
  }
}

async function readRawInferOutput(inferOutRawFolder: string, isSingleFileWithinProject?: boolean) {
  const currentWorkspaceFolder = getCurrentWorkspaceFolder();

  let inferCost: InferCostItem[] = [];
  try {
    const inferCostRawJsonString = await fs.promises.readFile(`${currentWorkspaceFolder}/${inferOutRawFolder}/costs-report.json`);
    let inferCostRaw = JSON.parse(inferCostRawJsonString);

    if (inferCostRaw.length === 0) {
      vscode.window.showErrorMessage("The costs-report from Infer is empty.");
      return false;
    }

    if (isSingleFileWithinProject) {
      resetNonConstantMethodsForFile();
    } else {
      resetNonConstantMethods();
    }

    for (let inferCostRawItem of inferCostRaw) {
      if (inferCostRawItem.procedure_name === "<init>" || inferCostRawItem.procedure_name === "<clinit>") {
        continue;
      }

      if (+inferCostRawItem.exec_cost.hum.hum_degree !== 0 && !nonConstantMethods.includes(inferCostRawItem.procedure_name)) {
        nonConstantMethods.push(inferCostRawItem.procedure_name);
      }

      let parameterTypes = inferCostRawItem.procedure_id.split("(")[1].split(")")[0].split(",");
      if (parameterTypes[0] === "") {
        parameterTypes = [];
      }
      for (let i in parameterTypes) {
        parameterTypes[i] = parameterTypes[i].split(".").pop();
      }

      let traceArray: TraceItem[] = [];
      for (const traceItem of inferCostRawItem.exec_cost.trace) {
        traceArray.push({
          level: +traceItem.level,
          filename: traceItem.filename,
          line_number: +traceItem.line_number,
          description: traceItem.description
        });
      }

      inferCost.push({
        id: inferCostRawItem.procedure_id,
        method_name: inferCostRawItem.procedure_name,
        parameters: parameterTypes,
        loc: {
          file: executionMode === ExecutionMode.Project ? `${currentWorkspaceFolder}/${inferCostRawItem.loc.file}` : activeTextEditor.document.fileName,
          lnum: inferCostRawItem.loc.lnum
        },
        exec_cost: {
          polynomial: inferCostRawItem.exec_cost.hum.hum_degree !== "Top" ? inferCostRawItem.exec_cost.hum.hum_polynomial.replace(/ \. /g, ' * ') : "Unknown",
          degree: inferCostRawItem.exec_cost.hum.hum_degree !== "Top" ? +inferCostRawItem.exec_cost.hum.hum_degree : -1,
          big_o: inferCostRawItem.exec_cost.hum.hum_degree !== "Top" ? inferCostRawItem.exec_cost.hum.big_o : "Unknown"
        },
        trace: traceArray
      });
    }
  } catch (err) {
    return false;
  }
  if (executionMode === ExecutionMode.Project && !isSingleFileWithinProject) {
    inferCost.sort((a: InferCostItem, b: InferCostItem) => a.loc.file.localeCompare(b.loc.file));
    if (!initializeInferCostsAndCurrentInferCost(inferCost)) {
      return false;
    }
  } else {
    setCurrentInferCost(inferCost.sort((a: InferCostItem, b: InferCostItem) => a.loc.lnum - b.loc.lnum));
    inferCosts.set(activeTextEditor.document.fileName, currentInferCost);
  }

  if (!isSingleFileWithinProject) {
    const inferCostJsonString = JSON.stringify(inferCost);
    try {
      await fs.promises.access(`${currentWorkspaceFolder}/infer-out-vscode`);
    } catch (err) {
      await fs.promises.mkdir(`${currentWorkspaceFolder}/infer-out-vscode`);
    }
    fs.promises.writeFile(`${currentWorkspaceFolder}/infer-out-vscode/${executionMode === ExecutionMode.Project ? "project" : `file-${getSourceFileName(activeTextEditor)}`}-costs.json`, inferCostJsonString, 'utf8');
  } else {
    let oldInferCost: InferCostItem[];
    try {
      const oldInferCostJsonString = await fs.promises.readFile(`${currentWorkspaceFolder}/infer-out-vscode/project-costs.json`);
      oldInferCost = JSON.parse(oldInferCostJsonString);
    } catch (err) {
      return false;
    }
    oldInferCost = oldInferCost.filter(oldInferCostItem => oldInferCostItem.loc.file !== inferCost[0].loc.file);
    inferCost = inferCost.concat(oldInferCost);
    const inferCostJsonString = JSON.stringify(inferCost);
    fs.promises.writeFile(`${currentWorkspaceFolder}/infer-out-vscode/project-costs.json`, inferCostJsonString, 'utf8');
  }

  return true;
}

async function readInferCostsReport(costsReportFile: string) {
  const currentWorkspaceFolder = getCurrentWorkspaceFolder();

  let inferCost: InferCostItem[] = [];
  try {
    const inferCostJsonString = await fs.promises.readFile(`${currentWorkspaceFolder}/infer-out-vscode/${costsReportFile}`);
    inferCost = JSON.parse(inferCostJsonString);
  } catch (err) {
    return false;
  }

  if (inferCost.length === 0) {
    vscode.window.showErrorMessage("The costs file for this project/file is empty.");
    return false;
  }

  for (const inferCostRawItem of inferCost) {
    if (inferCostRawItem.exec_cost.degree !== 0) {
      nonConstantMethods.push(inferCostRawItem.method_name);
    }
  }

  if (executionMode === ExecutionMode.Project) {
    if (!initializeInferCostsAndCurrentInferCost(inferCost)) {
      return false;
    }
  } else {
    setCurrentInferCost(inferCost);
    inferCosts.set(activeTextEditor.document.fileName, inferCost);
  }

  return true;
}

function initializeInferCostsAndCurrentInferCost(inferCost: InferCostItem[]) {
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
  if (sourceFilePath) {
    fileInferCost.sort((a: InferCostItem, b: InferCostItem) => a.loc.lnum - b.loc.lnum);
    inferCosts.set(sourceFilePath, fileInferCost);
  }

  const tmpInferCost = inferCosts.get(activeTextEditor.document.fileName);
  if (tmpInferCost) {
    setCurrentInferCost(tmpInferCost);
  } else { return false; }

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