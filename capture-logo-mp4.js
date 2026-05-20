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

  // Top-right corner
  html = html.replace('var CX=130, CY=130;', 'var CX=1790, CY=130;');

  // Font sizes: fill ~85% of the 40px annular band
  html = html.replace(
    'var fREISE   = Math.round(RT*0.27);\n  var fINSIDER = Math.round(RT*0.23);',
    'var fREISE   = Math.round(RT*0.46);\n  var fINSIDER = Math.round(RT*0.40);'
  );

  // Replace spacing param with spreadRad (angular span in radians).
  // arcText/arcTextGlow will be overridden below to interpret last numeric param as spreadRad.
  // REISE: 1.9 rad ≈ 109°  INSIDER: 2.1 rad ≈ 120°
  html = html.replace(
    "arcTextGlow('REISE',   RT, -Math.PI/2, false, '#00aaff', fREISE,   5, 8+4*glow);",
    "arcTextGlow('REISE',   RT, -Math.PI/2, false, '#00aaff', fREISE,   1.9, 8+4*glow);"
  );
  html = html.replace(
    "arcTextGlow('INSIDER', RT,  Math.PI/2, true,  '#ffaa00', fINSIDER, 3, 8+4*glow);",
    "arcTextGlow('INSIDER', RT,  Math.PI/2, true,  '#ffaa00', fINSIDER, 2.1, 8+4*glow);"
  );
  html = html.replace(
    "arcText(g, 'REISE',   RT, -Math.PI/2, false, '#ffffff', fREISE,   5);",
    "arcText(g, 'REISE',   RT, -Math.PI/2, false, '#ffffff', fREISE,   1.9);"
  );
  html = html.replace(
    "arcText(g, 'INSIDER', RT,  Math.PI/2, true,  '#ffd700', fINSIDER, 3);",
    "arcText(g, 'INSIDER', RT,  Math.PI/2, true,  '#ffd700', fINSIDER, 2.1);"
  );

  // Black background for MP4
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

  // Override arcText and arcTextGlow to use fixed angular spread instead of px spacing.
  // The 'spacing' param is now treated as spreadRad (arc span in radians).
  // Characters are proportionally distributed to fill exactly that arc.
  await page.evaluate(() => {
    function spreadArc(ctx, text, r, centerAngle, isBottom, col, fontSize, spreadRad) {
      ctx.save();
      ctx.font = '800 ' + fontSize + 'px "Arial Black",Arial,sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = col;

      // Measure each glyph
      var widths = [], totalW = 0;
      for (var i = 0; i < text.length; i++) {
        var w = ctx.measureText(text[i]).width;
        widths.push(w); totalW += w;
      }

      // Compute even spacing so all chars fill exactly spreadRad arc
      var arcLen = spreadRad * r;
      var gaps = text.length - 1;
      var spacing = gaps > 0 ? (arcLen - totalW) / gaps : 0;
      var totalAng = (totalW + gaps * spacing) / r;
      var cumW = 0;

      for (var i = 0; i < text.length; i++) {
        var charMid = cumW + widths[i] / 2;
        var theta = isBottom
          ? (centerAngle + totalAng / 2) - charMid / r
          : (centerAngle - totalAng / 2) + charMid / r;
        var px = CX + r * Math.cos(theta);
        var py = CY + r * Math.sin(theta);
        var rot = isBottom ? theta - Math.PI / 2 : theta + Math.PI / 2;
        ctx.save(); ctx.translate(px, py); ctx.rotate(rot);
        ctx.fillText(text[i], 0, 0); ctx.restore();
        cumW += widths[i] + spacing;
      }
      ctx.restore();
    }

    // Override arcText (called with main canvas g as first arg)
    window.arcText = function(ctx, text, r, centerAngle, isBottom, col, fontSize, spreadRad) {
      ctx.shadowBlur = 0;
      spreadArc(ctx, text, r, centerAngle, isBottom, col, fontSize, spreadRad);
    };

    // Override arcTextGlow (uses gg canvas from closure, blur is last arg)
    window.arcTextGlow = function(text, r, centerAngle, isBottom, col, fontSize, spreadRad, blur) {
      gg.save();
      gg.shadowColor = col;
      gg.shadowBlur  = blur * DPR;
      spreadArc(gg, text, r, centerAngle, isBottom, col, fontSize, spreadRad);
      gg.restore();
    };
  });

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
