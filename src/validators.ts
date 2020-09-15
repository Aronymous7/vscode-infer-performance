const util = require('util');
const exec = util.promisify(require('child_process').exec);

export function validateBuildCommand(buildCommand: string) {
  return ["javac", "mvn", "gradle", "./gradlew"].includes(buildCommand.split(" ")[0]);
}

export async function isInferInstalled() {
  try {
    await exec("infer --version");
  } catch (err) {
    return false;
  }
  return true;
}