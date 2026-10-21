export function notYet(command: string): void {
  console.error(`hooligans ${command} is not built yet.`);
  process.exitCode = 1;
}
