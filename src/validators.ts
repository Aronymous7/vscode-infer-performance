export function validateBuildCommand(buildCommand: string) {
  return ["javac", "mvn", "ant", "gradle", "./gradlew"].includes(buildCommand.split(" ")[0]);
}