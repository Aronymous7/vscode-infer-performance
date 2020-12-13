const util = require('util');
const exec = util.promisify(require('child_process').exec);

// Check if the build tool used in the build command provided by the user is supported.
export function validateBuildCommand(buildCommand: string) {
  return ["javac", "mvn", "gradle", "./gradlew"].includes(buildCommand.split(" ")[0]);
}

// Check if the provided classes folder is a valid path.
export function validateClassesFolder(classesFolder: string) {
  return /^([-\w]+|\.{1,2})(\/\w+)*\/?$/gm.test(classesFolder);
}

// Check if infer is installed on the system.
export async function isInferInstalled() {
  try {
    await exec("infer --version");
  } catch (err) {
    return false;
  }
  return true;
}