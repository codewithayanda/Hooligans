import { spawn } from 'node:child_process';

function openerFor(path: string): { command: string; args: string[] } {
  if (process.platform === 'win32') return { command: 'explorer.exe', args: [path] };
  if (process.platform === 'darwin') return { command: 'open', args: [path] };
  return { command: 'xdg-open', args: [path] };
}

/** Opens a file with the default app. If that fails the path is still printed, so nothing is lost. */
export function openFile(path: string): void {
  const { command, args } = openerFor(path);
  const child = spawn(command, args, { stdio: 'ignore', detached: true });

  child.on('error', () => undefined);
  child.unref();
}
