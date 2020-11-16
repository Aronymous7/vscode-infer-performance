# Static Performance Analysis for VSCode by Infer

This VSCode extension integrates the performance data for Java code by Facebook's static analysis tool Infer via code annotations, decorations, and separate side panel views showing details and overviews.

## Features

- CodeLenses showing function cost in big-O notation
- Detail/history view and overview windows when clicking on CodeLenses
- Traces in detail view explaining the calculated cost
- Cost-dependent color coding for functions
- Big changes in cost between analyses shown next to function
- Warning in CodeLens when function cost might have changed significantly based on code changes

## Requirements

So far, this extension is only usable on Unix-based systems.

Infer version 1.0 or higher must be installed on your system.

## Extension Settings

This extension contributes the following settings:

* `performance-by-infer.methodWhitelist`: Whitelisted methods that won't lead to an automatic re-execution of Infer when a call to them is added or removed somewhere in your code.
* `performance-by-infer.automaticReExecution`: Enable automatic re-execution of Infer when significant code changes get saved. Since this includes at least partial re-compilation, use with caution for larger projects.
* `performance-by-infer.buildCommand`: The build command to be used by Infer for compiling your project. Currently supported build tools: javac, maven, gradle
* `performance-by-infer.classesFolder`: The root package folder containing the compiled files from the project build. Required for single file execution within project.

## Tips/Caveats

- You might want to add infer-out and infer-out-vscode to your .gitignore
- When running infer outside of the extension, run it in the folder you open in VSCode to avoid issues with saved file paths.
- Recommended: Use fastest build command possible that compiles only necessary files (e.g. mvn compile -pl ...)
- Careful with renaming methods and changing their parameters, since the extension uses those to match the performance data.
- It is recommended to run Infer outside of the extension, and read the infer-out folder when enabling it (at least for larger projects).

## Known Issues

- Automatic re-execution and warning about potential performance changes works only when **currently open** file gets saved.
- Nested classes containing methods with same name and parameters as outer class can cause mapping issues
- Infer cannot always statically analyze all constructs, so the costs of some functions are unknown.

## Release Notes

### 1.0.0

Initial release of the extension.
