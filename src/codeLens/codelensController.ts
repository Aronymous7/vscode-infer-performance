import * as vscode from 'vscode';
import { activeTextEditor, currentInferCost } from '../inferController';
import { DetailCodelensProvider } from './detailCodelensProvider';
import { OverviewCodelensProvider } from './overviewCodelensProvider';

export let hasFileCodeLenses = new Map<string, boolean>();   // [sourceFilePath, hasCodeLenses]

// [sourceFilePath, codeLensDisposable]
let overviewCodeLensProviderDisposables = new Map<string, vscode.Disposable>();
let detailCodeLensProviderDisposables = new Map<string, vscode.Disposable>();

// Dispose all CodeLenses for all files.
export function disposeCodeLensProviders() {
  for (const codeLensProviderMapEntry of detailCodeLensProviderDisposables) {
    codeLensProviderMapEntry[1].dispose();
  }
  for (const codeLensProviderMapEntry of overviewCodeLensProviderDisposables) {
    codeLensProviderMapEntry[1].dispose();
  }
  hasFileCodeLenses = new Map<string, boolean>();
}

// Creates new CodeLenses for all functions in the current file.
export function createCodeLenses() {
  const sourceFilePath = activeTextEditor.document.fileName;
  const docSelector: vscode.DocumentSelector = { pattern: sourceFilePath, language: 'java' };

  overviewCodeLensProviderDisposables.get(sourceFilePath)?.dispose();
  detailCodeLensProviderDisposables.get(sourceFilePath)?.dispose();

  let codeLensProviderDisposable = vscode.languages.registerCodeLensProvider(docSelector, new OverviewCodelensProvider());
  overviewCodeLensProviderDisposables.set(sourceFilePath, codeLensProviderDisposable);

  codeLensProviderDisposable = vscode.languages.registerCodeLensProvider(docSelector, new DetailCodelensProvider(currentInferCost));
  detailCodeLensProviderDisposables.set(sourceFilePath, codeLensProviderDisposable);

  hasFileCodeLenses.set(sourceFilePath, true);
}