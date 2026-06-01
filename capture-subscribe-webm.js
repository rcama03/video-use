const puppeteer = require('puppeteer');
const fs = require('fs');
const { execSync } = require('child_process');

const FPS = 30, DURATION = 8.5, TOTAL = Math.ceil(FPS * DURATION);
const DIR = '/tmp/frames_sub_webm';
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

(async () => {
  let html = fs.readFileSync(
    '/root/.claude/uploads/c0899302-67db-4319-aed2-157e48764e42/c40d8cc4-subscribe_card_transparent.html', 'utf8');

  // Inject controlled time — subscribe card uses __captureT
  html = html.replace(
    'var T=(ts-T0)/1000;',
    'var T = (window.__captureT !== undefined) ? window.__captureT : (ts-T0)/1000;'
  );
  // No black background — canvas stays transparent

  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 400));

  await page.evaluate(() => {
    window.__draw = window.draw || draw;
    window.requestAnimationFrame = function() {};
  });

  console.log(`Capturing ${TOTAL} PNG frames at 1920×1080…`);
  for (let i = 0; i < TOTAL; i++) {
    const t = i / FPS;
    const b64 = await page.evaluate((t) => {
      window.__captureT = t;
      window.__draw(0);
      return document.getElementById('c').toDataURL('image/png').split(',')[1];
    }, t);
    fs.writeFileSync(`${DIR}/f${String(i).padStart(5,'0')}.png`, Buffer.from(b64, 'base64'));
    if (i % 50 === 0) process.stdout.write(`  ${i}/${TOTAL}\n`);
  }
  await browser.close();

  console.log('Encoding transparent WebM…');
  execSync(
    `ffmpeg -y -framerate ${FPS} -i ${DIR}/f%05d.png ` +
    `-i /tmp/subscribe-audio-v2.wav ` +
    `-c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 18 -deadline good -cpu-used 2 ` +
    `-c:a libopus -b:a 192k -shortest ` +
    `/home/user/video-use/reise-insider-subscribe-transparent.webm`,
    { stdio: 'inherit' }
  );
  console.log('Done: reise-insider-subscribe-transparent.webm');
})().catch(e => { console.error(e.message); process.exit(1); });
