import { commands } from './Commands';

export const processCommand = async (input) => {
  const tokens = input.trim().split(/\s+/);
  const [cmd, ...args] = tokens;

  if (!cmd) {
    return { output: '' };
  }

  const command = commands[cmd];

  if (!command) {
    return {
      output: `Command not found: ${cmd}`,
      error: true
    };
  }

  try {
    const result = await command.handler(args);
    return result;
  } catch (err) {
    return {
      output: `Error executing ${cmd}: ${err.message}`,
      error: true
    };
  }
};