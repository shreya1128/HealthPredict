import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outDir = path.resolve(__dirname, '../../docs/screenshots');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

async function run() {
  console.log('Launching browser with executable:', edgePath);
  const browser = await chromium.launch({
    executablePath: edgePath,
    headless: true,
  });

  const viewports = [
    { name: 'mobile-390', width: 390, height: 844 },
    { name: 'tablet-768', width: 768, height: 1024 },
    { name: 'desktop-1280', width: 1280, height: 800 },
  ];

  for (const vp of viewports) {
    console.log(`Capturing viewport: ${vp.name} (${vp.width}x${vp.height})...`);
    const page = await browser.newPage({
      viewport: { width: vp.width, height: vp.height },
    });

    try {
      // 1. Landing page
      await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 15000 });
      await page.screenshot({ path: path.join(outDir, `landing-${vp.name}.png`), fullPage: false });

      // 2. Login page
      await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle', timeout: 15000 });
      await page.screenshot({ path: path.join(outDir, `login-${vp.name}.png`), fullPage: false });
    } catch (err) {
      console.error(`Error on viewport ${vp.name}:`, err.message);
    } finally {
      await page.close();
    }
  }

  await browser.close();
  console.log('Finished capturing screenshots!');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
