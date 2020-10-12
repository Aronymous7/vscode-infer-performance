const util = require('util');
const exec = util.promisify(require('child_process').exec);

export function validateBuildCommand(buildCommand: string) {
  return ["javac", "mvn", "gradle", "./gradlew"].includes(buildCommand.split(" ")[0]);
}

export function validateClassesFolder(classesFolder: string) {
  return /^([-\w]+|\.{1,2})(\/\w+)*\/?$/gm.test(classesFolder);
}

export async function checkInferVersion() {
  try {
    let versionOutput = await exec("infer --version");
    let regex = new RegExp(/v(\d)/);
    let matches = regex.exec(versionOutput.stdout);
    if (matches) {
      return +matches[1];
    }
  } catch (err) {
    return -1;
  }
  return -1;
}