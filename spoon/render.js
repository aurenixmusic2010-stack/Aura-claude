// Frame renderer: serves the project, drives headless Chromium (SwiftShader WebGL2),
// and writes PNG frames posted back by the page.
//   node render.js --frames 0,45,90 --scale 0.5 --out preview
//   node render.js --range 0:1560 --workers 3 --out frames
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require(process.env.PW_PATH || '/opt/node-tools/node_modules/playwright');

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf('--' + k);
  return i >= 0 ? args[i + 1] : d;
};
const ROOT = __dirname;
const out = path.resolve(opt('out', 'preview'));
const scale = parseFloat(opt('scale', '1'));
const workers = parseInt(opt('workers', '1'));
const skipExisting = args.includes('--skip-existing');
let frames = [];
if (opt('frames')) frames = opt('frames').split(',').map(Number);
else if (opt('range')) {
  const [a, b, st] = opt('range').split(':').map(Number);
  for (let f = a; f < b; f += st || 1) frames.push(f);
}
fs.mkdirSync(out, { recursive: true });
if (skipExisting) frames = frames.filter((f) => !fs.existsSync(path.join(out, String(f).padStart(5, '0') + '.png')));

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/save/')) {
    const name = path.basename(req.url.slice(6));
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      fs.writeFileSync(path.join(out, name), Buffer.concat(chunks));
      res.writeHead(200);
      res.end('ok');
    });
    return;
  }
  const u = decodeURIComponent(req.url.split('?')[0]);
  const fp = path.join(ROOT, u === '/' ? 'index.html' : u);
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp)) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
  fs.createReadStream(fp).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-sandbox'],
  });
  const W = Math.round(1080 * scale);
  const H = Math.round(1920 * scale);
  const queue = frames.slice();
  const t0 = Date.now();
  let done = 0;
  const work = async (id) => {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on('console', (m) => console.log(`[w${id}]`, m.text()));
    page.on('pageerror', (e) => {
      console.log(`[w${id}] ERROR`, e.message, e.stack);
      process.exit(2);
    });
    await page.goto(`http://127.0.0.1:${port}/index.html?scale=${scale}`);
    await page.waitForFunction(() => window.READY === true, null, { timeout: 120000 });
    while (queue.length) {
      const f = queue.shift();
      await page.evaluate(([f, n]) => window.saveFrame(f, n), [f, String(f).padStart(5, '0') + '.png']);
      done++;
      if (done % 20 === 0 || done === frames.length) {
        const el = (Date.now() - t0) / 1000;
        console.log(`${done}/${frames.length} frames, ${(el / done).toFixed(2)} s/frame, eta ${((frames.length - done) * el / done / 60).toFixed(1)} min`);
      }
    }
    await page.close();
  };
  await Promise.all(Array.from({ length: workers }, (_, i) => work(i)));
  await browser.close();
  server.close();
  console.log('done in', ((Date.now() - t0) / 1000).toFixed(1), 's');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
