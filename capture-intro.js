const puppeteer = require('puppeteer');
const fs = require('fs');
const { execSync } = require('child_process');

const FPS = 30, DURATION = 5.5, TOTAL = Math.ceil(FPS * DURATION);
const DIR = '/tmp/frames_intro_mp4';
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

(async () => {
  let html = fs.readFileSync(
    '/root/.claude/uploads/62f93633-0365-43a2-848e-fc2f38beca4d/c83899dc-intro.html', 'utf8');

  // Scale to 4K
  html = html.replace('cv.width = W; cv.height = H;', 'cv.width = W*2; cv.height = H*2; g.scale(2,2);');

  // Black background for MP4 (add after clearRect inside draw)
  html = html.replace(
    'g.clearRect(0,0,W,H);',
    'g.clearRect(0,0,W,H);\n  g.fillStyle=\'#000000\'; g.fillRect(0,0,W,H);'
  );

  // Remove play button: stub out the showPlayButton / playButton UI
  // The play button is rendered via the 'ended' state — set autostart and skip ended block
  html = html.replace(
    /\/\/ play button[\s\S]*?ctx\.restore\(\);[\s]*?\}/m,
    ''
  );
  // Also remove any click handler that toggles play state
  html = html.replace(/document\.addEventListener\('click'[\s\S]*?\}\);/m, '');
  html = html.replace(/cv\.addEventListener\('click'[\s\S]*?\}\);/m, '');

  // Expose draw and disable RAF loop
  html = html.replace(
    /requestAnimationFrame\(draw\);[\s]*$/m,
    `window.__raf_disabled = true;\nwindow.__draw = draw;`
  );
  html = html.replace('</script>',
    `window.requestAnimationFrame = function(cb){ if(!window.__raf_disabled) cb(performance.now()); };\n</script>`
  );

  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 600));

  await page.evaluate(() => {
    // Make draw accessible
    if (typeof draw !== 'undefined') window.__draw = draw;
    window.requestAnimationFrame = function() {};
  });

  // Verify draw is available
  const hasDrawFn = await page.evaluate(() => typeof window.__draw === 'function');
  if (!hasDrawFn) {
    console.error('ERROR: __draw not found on window');
    await browser.close();
    process.exit(1);
  }

  // Use base timestamp of 1000ms to avoid T0=0 falsy bug (if(!T0) T0=ts fails when T0=0)
  const BASE_TS = 1000;

  console.log(`Capturing ${TOTAL} frames at 3840×2160…`);
  for (let i = 0; i < TOTAL; i++) {
    const ts = BASE_TS + (i / FPS) * 1000;
    const b64 = await page.evaluate((ts) => {
      window.__draw(ts);
      return document.getElementById('c').toDataURL('image/jpeg', 0.96).split(',')[1];
    }, ts);
    fs.writeFileSync(`${DIR}/f${String(i).padStart(5,'0')}.jpg`, Buffer.from(b64, 'base64'));
    if (i % 30 === 0) process.stdout.write(`  ${i}/${TOTAL}\n`);
  }
  await browser.close();

  console.log('Encoding MP4 with audio…');
  execSync(
    `ffmpeg -y -framerate ${FPS} -i ${DIR}/f%05d.jpg -i /tmp/intro-audio.wav ` +
    `-c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p ` +
    `-c:a aac -b:a 192k -shortest ` +
    `/home/user/video-use/reise-insider-intro-4k.mp4`,
    { stdio: 'inherit' }
  );
  console.log('Done: reise-insider-intro-4k.mp4');
})().catch(e => { console.error(e.message); process.exit(1); });
