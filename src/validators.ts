const util = require('util');
const exec = util.promisify(require('child_process').exec);

export function validateBuildCommand(buildCommand: string) {
  return ["javac", "mvn", "gradle", "./gradlew"].includes(buildCommand.split(" ")[0]);
}

export function validateClassesFolder(classesFolder: string) {
  return /^(\w+|\.{1,2})(\/\w+)*\/?$/gm.test(classesFolder);
}

export async function isInferInstalled() {
  try {
    await exec("infer --version");
  } catch (err) {
    return false;
  }
  return true;
}