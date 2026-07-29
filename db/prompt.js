/**
 * Terminal prompts for the account scripts. Passwords are read without echoing
 * so they do not end up in a screen share or a scrollback buffer, and they are
 * never accepted as a command line argument, where they would land in shell
 * history and the process list.
 */
import { stdin, stdout } from 'node:process';

const ENTER = ['\r', '\n', '\u0004'];   // return, newline, ctrl-d
const INTERRUPT = '\u0003';                // ctrl-c
const ERASE = ['\u007f', '\b'];           // delete, backspace

export function ask(question) {
  return new Promise((resolve) => {
    stdout.write(question);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (chunk) => {
      stdin.pause();
      stdin.removeListener('data', onData);
      resolve(String(chunk).replace(/[\r\n]+$/, ''));
    };
    stdin.on('data', onData);
  });
}

export function askHidden(question) {
  return new Promise((resolve, reject) => {
    if (!stdin.isTTY) {
      reject(new Error('A terminal is required to enter a password.'));
      return;
    }
    stdout.write(question);
    stdin.resume();
    stdin.setEncoding('utf8');
    stdin.setRawMode(true);

    let value = '';

    const finish = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
      stdout.write('\n');
    };

    const onData = (chunk) => {
      for (const char of String(chunk)) {
        if (ENTER.includes(char)) {
          finish();
          resolve(value);
          return;
        }
        if (char === INTERRUPT) {
          finish();
          process.exit(130);
        }
        if (ERASE.includes(char)) {
          value = value.slice(0, -1);
          continue;
        }
        value += char;
      }
    };

    stdin.on('data', onData);
  });
}

/** Parses --key=value and --key value pairs. */
export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      out[arg.slice(2, eq)] = arg.slice(eq + 1);
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out[arg.slice(2)] = next;
      i += 1;
    } else {
      out[arg.slice(2)] = 'true';
    }
  }
  return out;
}

/**
 * Minimum bar for a staff password. Deliberately about length rather than
 * character classes, which push people towards predictable substitutions.
 */
export function checkPassword(password) {
  if (password.length < 12) return 'Password must be at least 12 characters.';
  if (/^\s|\s$/.test(password)) return 'Password must not start or end with a space.';
  if (/^(.)\1+$/.test(password)) return 'Password must not be a single repeated character.';
  return null;
}
