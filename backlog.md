# Infer for VSCode Backlog

## General

- Test Infer execution time on large code base
  - Compare javac with the respective build tool (e.g. Maven), maybe in combination with the --reactive option of Infer
- Implement execution of Infer using build tools

## Editor Decorator

- Interactive coloring (e.g. when an expensive method cannot be made cheaper -> set color to green)

## Code Lenses

- History of runtimes after each execution of Infer
  - Show what code changes likely led to significant change in cost (added/removed loop, method call, etc.)
  - Give option to persist history between sessions (optional)

## Webview

- Make more secure against injections
- Add some styling