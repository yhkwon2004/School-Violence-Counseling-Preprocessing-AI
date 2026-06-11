import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

function readArg(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const host = readArg('--host', process.env.HOST || '127.0.0.1');
const port = Number(readArg('--port', process.env.PORT || '5175'));
const root = path.resolve(repoRoot, readArg('--root', 'apps/web/dist'));
const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
]);

if (!existsSync(path.join(root, 'index.html'))) {
  console.error(`Missing ${path.join(root, 'index.html')}. Run npm.cmd run build first.`);
  process.exit(1);
}

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url || '/', `http://${host}:${port}`);
  const relativePath = requestUrl.pathname === '/' ? 'index.html' : decodeURIComponent(requestUrl.pathname.slice(1));
  const requestedPath = path.resolve(root, relativePath);

  if (!requestedPath.startsWith(root)) {
    response.writeHead(403);
    response.end('forbidden');
    return;
  }

  const filePath = await resolveFile(requestedPath);
  if (!filePath) {
    response.writeHead(404);
    response.end('not found');
    return;
  }

  response.writeHead(200, {
    'content-type': mimeTypes.get(path.extname(filePath)) || 'application/octet-stream',
  });
  createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
  console.log(`Approved Drone MVP running at http://${host}:${port}`);
});

async function resolveFile(filePath) {
  try {
    const info = await stat(filePath);
    if (info.isFile()) return filePath;
    if (info.isDirectory()) {
      const indexPath = path.join(filePath, 'index.html');
      return existsSync(indexPath) ? indexPath : null;
    }
  } catch {
    const fallback = path.join(root, 'index.html');
    return existsSync(fallback) ? fallback : null;
  }
  return null;
}
