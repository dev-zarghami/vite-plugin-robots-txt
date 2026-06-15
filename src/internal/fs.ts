import fs from 'node:fs';
import path from 'node:path';
import type { Logger } from 'vite';

/**
 * Write `content` to `filePath`, but only if it differs from what is already on
 * disk. Parent directories are created as needed.
 *
 * Reading-then-comparing (instead of `existsSync` + read) avoids a TOCTOU race
 * and an extra `stat` syscall: a missing file simply throws and is treated as
 * "no previous content".
 *
 * @returns `true` if a write happened, `false` if the file was already current.
 */
export async function writeFileIfChanged(
  filePath: string,
  content: string,
  logger: Logger,
  tag: string,
): Promise<boolean> {
  let previous: string | null = null;
  try {
    previous = await fs.promises.readFile(filePath, 'utf8');
  } catch {
    // File does not exist or is unreadable — fall through and write it.
  }

  if (previous === content) {
    logger.info(`${tag} unchanged: ${filePath}`);
    return false;
  }

  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, content, 'utf8');
  logger.info(`${tag} wrote ${filePath}`);
  return true;
}
