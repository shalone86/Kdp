// End-to-end smoke test: creates a book from generated photos, auto-builds it and exports both PDFs.
// Usage: start the app (npm run dev), then:  node scripts/smoke.mjs [outDir]
// Uses playwright-core; set CHROMIUM_PATH if Chromium isn't at the default location.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const out = path.resolve(process.argv[2] ?? 'test-output');
fs.mkdirSync(out, { recursive: true });
const url = process.env.APP_URL ?? 'http://localhost:5173/';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(url);
await page.getByText('Next →').click();
await page.getByText('Next →').click();
await page.getByPlaceholder('Our Summer in Italy').fill('Smoke Test');
await page.getByText('Create book & add photos →').click();

// Generate 30 photos (mixed portrait/landscape) in the browser.
const photos = await page.evaluate(async () => {
  const out = [];
  for (let i = 0; i < 30; i++) {
    const portrait = i % 3 === 0;
    const c = document.createElement('canvas');
    c.width = portrait ? 2400 : 3200;
    c.height = portrait ? 3200 : 2400;
    const g = c.getContext('2d');
    g.fillStyle = `hsl(${(i * 37) % 360} 60% 60%)`;
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#fff';
    g.font = `${c.width / 6}px sans-serif`;
    g.fillText(`#${i + 1}`, c.width * 0.1, c.height * 0.3);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let k = 0; k < buf.length; k += 0x8000) s += String.fromCharCode(...buf.subarray(k, k + 0x8000));
    out.push(btoa(s));
  }
  return out;
});
await page.locator('input[type=file]').first().setInputFiles(photos.map((b64, i) => ({ name: `p${i}.jpg`, mimeType: 'image/jpeg', buffer: Buffer.from(b64, 'base64') })));
await page.getByText('Create my book automatically').waitFor({ timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('.import-progress'), null, { timeout: 120000 });
await page.getByText('Create my book automatically').click();
await page.waitForTimeout(1000);
await page.screenshot({ path: path.join(out, 'editor.png') });

await page.getByText('Check & export').click();
for (const kind of ['interior', 'cover']) {
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 180000 }), page.getByText(`⬇ Download ${kind} PDF`).click()]);
  const file = path.join(out, `${kind}.pdf`);
  await d.saveAs(file);
  const head = fs.readFileSync(file).subarray(0, 5).toString();
  if (head !== '%PDF-') errors.push(`${kind}.pdf is not a PDF`);
  console.log(`${kind}.pdf: ${(fs.statSync(file).size / 1e6).toFixed(2)} MB`);
}
await browser.close();
if (errors.length) {
  console.error('FAILED:\n' + errors.join('\n'));
  process.exit(1);
}
console.log(`OK — output in ${out}`);
