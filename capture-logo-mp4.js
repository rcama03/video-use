const puppeteer = require('puppeteer');
const fs = require('fs');
const { execSync } = require('child_process');

const FPS = 30, DURATION = 20, TOTAL = FPS * DURATION;
const DIR = '/tmp/frames_logo_mp4';
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

(async () => {
  let html = fs.readFileSync(
    '/root/.claude/uploads/c0899302-67db-4319-aed2-157e48764e42/f9c9a7bb-logoanimated.html', 'utf8');

  // 4K: force DPR=2
  html = html.replace(
    'var DPR = Math.min(window.devicePixelRatio || 1, 2);',
    'var DPR = 2;'
  );

  // Add black fill at the start of each frame (after clearRect) so MP4 has solid background
  html = html.replace(
    '// ── 1. Clear both canvases ──────────────────────\n  g.clearRect(0,0,W,H);\n  gg.clearRect(0,0,W,H);',
    '// ── 1. Clear both canvases ──────────────────────\n  g.clearRect(0,0,W,H);\n  gg.clearRect(0,0,W,H);\n  g.fillStyle=\'#000000\'; g.fillRect(0,0,W,H);'
  );

  // Disable RAF loop; expose draw
  html = html.replace(
    /requestAnimationFrame\(draw\);[\s]*$/m,
    `window.__raf_disabled = true;\nwindow.__draw = draw;`
  );
  html = html.replace('</script>',
    `window.requestAnimationFrame = function(cb){ if(!window.__raf_disabled) cb(0); };\n</script>`
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
      return document.getElementById('c').toDataURL('image/jpeg', 0.96).split(',')[1];
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
