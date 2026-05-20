const puppeteer = require('puppeteer');
const fs = require('fs');
const { execSync } = require('child_process');

const FPS = 30;
const DURATION = 20; // one full loop
const TOTAL = FPS * DURATION; // 600 frames
const DIR = '/tmp/frames_logo';
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

(async () => {
  let html = fs.readFileSync(
    '/root/.claude/uploads/c0899302-67db-4319-aed2-157e48764e42/f9c9a7bb-logoanimated.html', 'utf8');

  // Force DPR=2 → canvas becomes 3840×2160 physically, coords stay in 1920×1080 logical space
  html = html.replace(
    'var DPR = Math.min(window.devicePixelRatio || 1, 2);',
    'var DPR = 2;'
  );

  // Replace the final RAF kick-off with a controlled render function.
  // Also neutralise internal RAF calls so they don't fight us.
  html = html.replace(
    /requestAnimationFrame\(draw\);[\s]*$/m,
    `window.__raf_disabled = true;
window.__draw = draw;`
  );

  // Neutralise the RAF call inside draw() itself
  html = html.replace(
    /\/\/ ── 4\. Draw all SHARP/,
    '// ── 4. Draw all SHARP'
  );

  // Patch: wrap requestAnimationFrame so our manual calls don't spawn loops
  html = html.replace(
    '</script>',
    `window._origRAF = window.requestAnimationFrame;
window.requestAnimationFrame = function(cb){ if(!window.__raf_disabled) window._origRAF(cb); };
</script>`
  );

  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 400));

  console.log(`Capturing ${TOTAL} frames at 3840×2160…`);
  for (let i = 0; i < TOTAL; i++) {
    const ms = (i / FPS) * 1000;
    const b64 = await page.evaluate((ms) => {
      window.__draw(ms);
      return document.getElementById('c').toDataURL('image/jpeg', 0.95).split(',')[1];
    }, ms);
    fs.writeFileSync(`${DIR}/f${String(i).padStart(5,'0')}.jpg`, Buffer.from(b64, 'base64'));
    if (i % 60 === 0) process.stdout.write(`  ${i}/${TOTAL}\n`);
  }

  await browser.close();
  console.log('Encoding MP4…');
  execSync(
    `ffmpeg -y -framerate ${FPS} -i ${DIR}/f%05d.jpg ` +
    `-c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p ` +
    `/home/user/video-use/reise-insider-animated-logo-4k.mp4`,
    { stdio: 'inherit' }
  );
  console.log('Done: reise-insider-animated-logo-4k.mp4');
})().catch(e => { console.error(e.message); process.exit(1); });
