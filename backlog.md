# Infer for VSCode Backlog

## General

- Test Infer execution time on large code base

## Editor Decorator

- Color coding for significant changes in cost
- Interactive coloring (e.g. when an expensive method cannot be made cheaper -> set color to green)

## Code Lenses

- History of runtimes after each execution of Infer
  - Show what code changes likely led to significant change in cost (added/removed loop, method call, etc.)
  - Give option to persist history between sessions (optional)
- Show significant changes in cost immediately in CodeLens (maybe with color coding, warning messages, etc.)

## Webview

- Make more secure against injections