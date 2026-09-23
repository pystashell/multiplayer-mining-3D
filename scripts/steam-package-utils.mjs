import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  readdir,
  stat,
} from 'node:fs/promises';
import {
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path';

export function assertPathInside(parent, candidate, label = 'path') {
  const parentPath = resolve(parent);
  const candidatePath = resolve(candidate);
  const relativePath = relative(parentPath, candidatePath);
  if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new Error(`Refusing to use ${label} outside its expected parent: ${candidatePath}`);
  }
  return candidatePath;
}

export async function listFiles(directory) {
  const root = resolve(directory);
  const files = [];

  async function visit(current) {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolutePath = resolve(current, entry.name);
      if (entry.isDirectory()) await visit(absolutePath);
      else if (entry.isFile()) files.push(relative(root, absolutePath).replaceAll('\\', '/'));
    }
  }

  await visit(root);
  return files;
}

export async function sha256File(filename) {
  return new Promise((resolveDigest, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filename);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolveDigest(hash.digest('hex')));
  });
}

export async function describeFiles(directory) {
  const root = resolve(directory);
  const paths = await listFiles(root);
  const descriptions = [];
  for (const path of paths) {
    const absolutePath = resolve(root, path);
    const metadata = await stat(absolutePath);
    descriptions.push({
      path,
      bytes: metadata.size,
      sha256: await sha256File(absolutePath),
    });
  }
  return descriptions;
}
