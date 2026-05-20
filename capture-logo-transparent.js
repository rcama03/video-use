const puppeteer = require('puppeteer');
const fs = require('fs');
const { execSync, spawn } = require('child_process');

const FPS = 30;
const DURATION = 20;
const TOTAL = FPS * DURATION; // 600
const DIR = '/tmp/frames_logo_t';
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

(async () => {
  let html = fs.readFileSync(
    '/root/.claude/uploads/c0899302-67db-4319-aed2-157e48764e42/f9c9a7bb-logoanimated.html', 'utf8');

  // 4K: force DPR=2 so canvas is 3840×2160 physically, logic stays in 1920×1080
  html = html.replace(
    'var DPR = Math.min(window.devicePixelRatio || 1, 2);',
    'var DPR = 2;'
  );

  // Remove dark fills so the logo floats on a transparent background:
  // 1. Ring background fill
  html = html.replace(
    /\/\/ Ring background[\s\S]*?gg\.fill\(\);/,
    '// ring background fill removed for transparency'
  );
  // 2. Inner fill (inside inner ring)
  html = html.replace(
    /\/\/ Inner fill[\s\S]*?gg\.fill\(\);/,
    '// inner fill removed for transparency'
  );
  // 3. Vignette
  html = html.replace(
    /\/\/ Vignette[\s\S]*?gg\.fill\(\);/,
    '// vignette removed for transparency'
  );

  // Disable RAF loop; expose draw
  html = html.replace(
    /requestAnimationFrame\(draw\);[\s]*$/m,
    `window.__raf_disabled = true;
window.__draw = draw;`
  );
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

  console.log(`Capturing ${TOTAL} frames (transparent, 3840×2160)…`);
  for (let i = 0; i < TOTAL; i++) {
    const ms = (i / FPS) * 1000;
    const b64 = await page.evaluate((ms) => {
      window.__draw(ms);
      return document.getElementById('c').toDataURL('image/png').split(',')[1];
    }, ms);
    fs.writeFileSync(`${DIR}/f${String(i).padStart(5,'0')}.png`, Buffer.from(b64, 'base64'));
    if (i % 60 === 0) process.stdout.write(`  ${i}/${TOTAL}\n`);
  }
  await browser.close();

  console.log('Encoding transparent WebM (VP9 + alpha)…');
  execSync(
    `ffmpeg -y -framerate ${FPS} -i ${DIR}/f%05d.png ` +
    `-c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 15 -threads 4 ` +
    `/home/user/video-use/reise-insider-animated-logo-4k-transparent.webm`,
    { stdio: 'inherit' }
  );
  console.log('Done: reise-insider-animated-logo-4k-transparent.webm');
})().catch(e => { console.error(e.message); process.exit(1); });
