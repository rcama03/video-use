const puppeteer = require('puppeteer');
const fs = require('fs');
const { execSync } = require('child_process');

const FPS = 30;
const DURATION = 8.5;
const TOTAL = Math.ceil(FPS * DURATION); // 255 frames
const DIR = '/tmp/frames_sub';
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

(async () => {
  let html = fs.readFileSync(
    '/root/.claude/uploads/c0899302-67db-4319-aed2-157e48764e42/c40d8cc4-subscribe_card_transparent.html', 'utf8');

  // Scale canvas to 4K
  html = html.replace(
    'cv.width=W; cv.height=H;',
    'cv.width=W*2; cv.height=H*2; g.scale(2,2);'
  );

  // Inject controlled time override into draw()
  html = html.replace(
    'var T=(ts-T0)/1000;',
    'var T = (window.__captureT !== undefined) ? window.__captureT : (ts-T0)/1000;'
  );

  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 400));

  // Expose draw and disable RAF — draw is a var-declared global in the page
  await page.evaluate(() => {
    window.__draw = window.draw || draw; // var draw is a page global
    window.requestAnimationFrame = function() {};
  });

  // Verify
  const ok = await page.evaluate(() => typeof window.__draw);
  console.log('draw type:', ok);
  if (ok !== 'function') throw new Error('draw not found in page scope');

  console.log(`Capturing ${TOTAL} frames at 3840×2160…`);
  for (let i = 0; i < TOTAL; i++) {
    const t = i / FPS;
    const b64 = await page.evaluate((t) => {
      window.__captureT = t;
      window.__draw(0);
      return document.getElementById('c').toDataURL('image/jpeg', 0.95).split(',')[1];
    }, t);
    fs.writeFileSync(`${DIR}/f${String(i).padStart(5,'0')}.jpg`, Buffer.from(b64, 'base64'));
    if (i % 50 === 0) process.stdout.write(`  ${i}/${TOTAL}\n`);
  }

  await browser.close();
  console.log('Encoding MP4…');
  execSync(
    `ffmpeg -y -framerate ${FPS} -i ${DIR}/f%05d.jpg ` +
    `-c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p ` +
    `/home/user/video-use/reise-insider-subscribe-card-4k.mp4`,
    { stdio: 'inherit' }
  );
  console.log('Done: reise-insider-subscribe-card-4k.mp4');
})().catch(e => { console.error(e.message); process.exit(1); });
