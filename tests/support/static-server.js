// Serves public/ the way Workers Static Assets does for the solo game: the
// same files, the same response headers from public/_headers (including the
// Content Security Policy), and a plain 404 for anything missing. Solo mode
// runs entirely in the browser, so no Worker is needed behind it.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PUBLIC_ROOT = fileURLToPath(new URL('../../public/', import.meta.url));

const CONTENT_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
});

function patternExpression(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*');
  return new RegExp(`^${escaped}$`);
}

// Parses the Cloudflare `_headers` format: an unindented URL pattern followed
// by indented `Name: value` lines. `! Name` removes a header set by an earlier
// rule.
export function parseHeadersFile(source) {
  const rules = [];
  let current = null;
  for (const rawLine of source.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trim().startsWith('#')) continue;
    if (!/^\s/.test(rawLine)) {
      current = { pattern: rawLine.trim(), expression: patternExpression(rawLine.trim()), set: [], remove: [] };
      rules.push(current);
      continue;
    }
    if (!current) throw new Error(`Header line without a URL pattern: ${rawLine}`);
    const line = rawLine.trim();
    if (line.startsWith('!')) {
      current.remove.push(line.slice(1).trim().toLowerCase());
      continue;
    }
    const separator = line.indexOf(':');
    if (separator <= 0) throw new Error(`Malformed header line: ${rawLine}`);
    current.set.push([line.slice(0, separator).trim(), line.slice(separator + 1).trim()]);
  }
  return rules;
}

export function headersForPath(rules, pathname) {
  const headers = new Map();
  for (const rule of rules) {
    if (!rule.expression.test(pathname)) continue;
    for (const name of rule.remove) headers.delete(name);
    for (const [name, value] of rule.set) {
      const key = name.toLowerCase();
      const previous = headers.get(key);
      headers.set(key, previous ? { name, value: `${previous.value}, ${value}` } : { name, value });
    }
  }
  return Object.fromEntries([...headers.values()].map(({ name, value }) => [name, value]));
}

async function resolveFile(root, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const candidate = path.resolve(root, `.${decoded.endsWith('/') ? `${decoded}index.html` : decoded}`);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) return null;
  try {
    const info = await stat(candidate);
    if (info.isFile()) return candidate;
    if (info.isDirectory()) {
      const index = path.join(candidate, 'index.html');
      if ((await stat(index)).isFile()) return index;
    }
  } catch {}
  return null;
}

export async function startStaticServer({ root = PUBLIC_ROOT } = {}) {
  const resolvedRoot = path.resolve(root);
  const rules = parseHeadersFile(await readFile(path.join(resolvedRoot, '_headers'), 'utf8'));
  const requests = [];
  const server = createServer(async (request, response) => {
    const { pathname } = new URL(request.url, 'http://localhost');
    requests.push(pathname);
    const file = pathname === '/_headers' ? null : await resolveFile(resolvedRoot, pathname);
    if (!file || !['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(file ? 405 : 404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(file ? 'Method Not Allowed' : 'Not Found');
      return;
    }
    const body = await readFile(file);
    response.writeHead(200, {
      ...headersForPath(rules, pathname),
      'Content-Type': CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': body.length,
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise((resolve) => {
      server.closeAllConnections?.();
      server.close(() => resolve());
    }),
  };
}
