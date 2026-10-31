// A tiny static file server for the built simulator (no dependencies).
// Usage: npm run build && node serve.js   (PORT and HOST can be set as environment variables)
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), 'build');
const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '0.0.0.0';

const TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.png': 'image/png',
	'.svg': 'image/svg+xml',
	'.ttf': 'font/ttf',
	'.ico': 'image/x-icon',
	'.txt': 'text/plain; charset=utf-8'
};

function fileFor(urlPath) {
	const safe = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
	let path = join(root, safe);
	if (!path.startsWith(root)) return null;
	try {
		if (statSync(path).isDirectory()) path = join(path, 'index.html');
		statSync(path);
		return path;
	} catch {
		return null;
	}
}

createServer((req, res) => {
	const path = fileFor(req.url || '/') ?? join(root, 'index.html');
	const immutable = path.includes(`${join('_app', 'immutable')}`);
	res.writeHead(200, {
		'Content-Type': TYPES[extname(path)] ?? 'application/octet-stream',
		'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache'
	});
	createReadStream(path).pipe(res);
}).listen(port, host, () => {
	console.log(`mBot2 simulator running at http://localhost:${port}`);
});
