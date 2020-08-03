# Infer for VSCode Backlog

## General

- Re-execute Infer when code (within respective method) changes significantly
  - When loops or method calls get added (with exceptions like println)
- Test Infer execution time on large code base

## Editor Decorator

- Color coding for significant changes in cost
- Interactive coloring (e.g. when an expensive method cannot be made cheaper -> color in green)

## Code Lenses

- Show webview (overview and history) when clicking on CodeLens
  - Highlight current or most recent method in webview
- History of runtimes after each execution of Infer
  - Give option to persist history between sessions
  - Only create new history entry for method if code/cost changed
- Show significant changes in cost immediately in CodeLens (maybe with color coding, warning messages, etc.)

## Webview

- Make more secure against injections