#!/usr/bin/env python3
"""Generate motion graphics overlay for powerbank video.
   Adds: progress bar, chapter cards, danger vignette, badge, save hooks, end CTA.
   Does NOT touch existing HyperFrames graphics."""

import subprocess, sys, os, math
from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 1280, 720
OVERLAY_FPS  = 15          # overlay rendered at 15 fps (smooth enough, fast to generate)
DURATION     = 213.1
TOTAL_FRAMES = int(DURATION * OVERLAY_FPS)

YELLOW = (255, 193,  7)
RED    = (220,  53, 69)
GREEN  = ( 40, 167, 69)
WHITE  = (255, 255,255)
BLACK  = (  0,   0,  0)
DARK   = ( 12,  12, 12)

FONT_PATH = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
REG_PATH  = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf" \
            if os.path.exists("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf") \
            else FONT_PATH

_font_cache = {}
def F(size, reg=False):
    key = (size, reg)
    if key not in _font_cache:
        path = REG_PATH if reg else FONT_PATH
        _font_cache[key] = ImageFont.truetype(path, size)
    return _font_cache[key]

def ease_out(t):
    t = max(0.0, min(1.0, t))
    return 1 - (1 - t) ** 3

def rrect(draw, x1, y1, x2, y2, r, fill):
    """Filled rounded rectangle."""
    draw.rectangle([x1 + r, y1, x2 - r, y2], fill=fill)
    draw.rectangle([x1, y1 + r, x2, y2 - r], fill=fill)
    for cx, cy in [(x1, y1), (x2 - 2*r, y1), (x1, y2 - 2*r), (x2 - 2*r, y2 - 2*r)]:
        draw.ellipse([cx, cy, cx + 2*r, cy + 2*r], fill=fill)

def make_frame(n):
    t    = n / OVERLAY_FPS
    prog = n / TOTAL_FRAMES

    img = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    d   = ImageDraw.Draw(img)

    # ── 1. PROGRESS BAR ─────────────────────────────────────────────────────
    bw = max(0, int(WIDTH * prog))
    if bw > 0:
        d.rectangle([0, 0, bw, 4], fill=(*YELLOW, 210))
        # glowing leading tip
        glow = min(24, bw)
        for i in range(glow, 0, -1):
            d.rectangle([bw - i, 0, bw, 4], fill=(*YELLOW, int(100 * i / glow)))
    # chapter tick marks
    for cs in [25, 55, 90, 130, 165]:
        cx = int(WIDTH * cs / DURATION)
        d.rectangle([cx, 0, cx + 2, 8], fill=(255, 255, 255, 130))

    # ── 2. CHAPTER TITLE CARDS (top-center, slide down) ──────────────────────
    CHAPTERS = [
        (  0,  9, "INTRO",   "Powerbank-Regeln im Flugzeug"),
        ( 25, 34, "TEIL 1",  "Die IATA 100-Wh-Grenze"),
        ( 55, 64, "TEIL 2",  "Warum Lithium-Akkus gefährlich sind"),
        ( 90, 99, "TEIL 3",  "Wattstunden selbst berechnen"),
        (130,139, "TEIL 4",  "Konfisziert – was passiert dann?"),
        (165,174, "TEIL 5",  "Tipps für stressfreies Reisen"),
    ]
    for (st, en, lbl, sub) in CHAPTERS:
        if st <= t < en:
            lt = (t - st) / (en - st)
            if lt < 0.25:
                a = ease_out(lt / 0.25)
                dy = int((1 - ease_out(lt / 0.25)) * -50)
            elif lt > 0.75:
                a = 1 - ease_out((lt - 0.75) / 0.25)
                dy = 0
            else:
                a = 1.0; dy = 0

            av = int(a * 220)
            cw, ch = 470, 66
            cx = (WIDTH - cw) // 2
            cy = 12 + dy

            rrect(d, cx, cy, cx + cw, cy + ch, 6, (*DARK, av))
            d.rectangle([cx, cy, cx + 4, cy + ch], fill=(*YELLOW, av))
            d.text((cx + 18, cy + 9),  lbl, fill=(*YELLOW, av), font=F(19))
            d.text((cx + 18, cy + 36), sub, fill=(*WHITE,  av), font=F(16, reg=True))

    # ── 3. DANGER VIGNETTE (pulsing red border, danger section ~52–92 s) ──────
    for (ds, de) in [(52, 92)]:
        if ds <= t < de:
            pulse  = (math.sin((t - ds) * math.pi * 1.8) + 1) / 2
            a_base = int(25 + pulse * 55)
            for i in range(55, 0, -1):
                ratio = ((55 - i) / 55) ** 2
                aa    = int(a_base * ratio)
                if aa < 2: continue
                d.rectangle([i, i,           WIDTH - i, i + 1],         fill=(*RED, aa))
                d.rectangle([i, HEIGHT-i-1,  WIDTH - i, HEIGHT - i],    fill=(*RED, aa))
                d.rectangle([i, i,           i + 1,     HEIGHT - i],    fill=(*RED, aa))
                d.rectangle([WIDTH-i-1, i,   WIDTH - i, HEIGHT - i],    fill=(*RED, aa))

    # ── 4. ERLAUBT / VERBOTEN BADGE (top-right) ───────────────────────────────
    BADGES = [
        ( 88, 108, True,  "ERLAUBT"),
        (165, 180, False, "VERBOTEN"),
    ]
    for (bs, be, is_ok, blbl) in BADGES:
        if bs <= t < be:
            lt = (t - bs) / (be - bs)
            a  = ease_out(lt / 0.15) if lt < 0.15 else \
                 (1 - ease_out((lt - 0.85) / 0.15) if lt > 0.85 else 1.0)
            av = int(a * 220)
            col = GREEN if is_ok else RED
            sym = "✓" if is_ok else "✗"

            bx, by = WIDTH - 138, 14
            bw2, bh2 = 122, 56
            rrect(d, bx, by, bx + bw2, by + bh2, 8, (*col, av))
            # symbol
            symbox = d.textbbox((0, 0), sym, font=F(28))
            sw = symbox[2] - symbox[0]
            d.text((bx + (bw2 - sw)//2, by + 5),  sym,  fill=(*WHITE, av), font=F(28))
            lblbox = d.textbbox((0, 0), blbl, font=F(12))
            lw = lblbox[2] - lblbox[0]
            d.text((bx + (bw2 - lw)//2, by + 38), blbl, fill=(*WHITE, av), font=F(12))

    # ── 5. "TIPP MERKEN" save-hook card (bottom-right) ────────────────────────
    HOOKS = [(100, 115), (168, 183)]
    for (hs, he) in HOOKS:
        if hs <= t < he:
            lt = (t - hs) / (he - hs)
            if lt < 0.2:
                a  = ease_out(lt / 0.2)
                dy = int((1 - ease_out(lt / 0.2)) * 28)
            elif lt > 0.85:
                a  = 1 - ease_out((lt - 0.85) / 0.15)
                dy = 0
            else:
                a  = 1.0
                dy = int(abs(math.sin((t - hs) * 4)) * 3)  # subtle bob
            av = int(a * 215)

            hx = WIDTH - 200
            hy = HEIGHT - 152 + dy
            hw, hh = 182, 46

            rrect(d, hx, hy, hx + hw, hy + hh, 9, (*YELLOW, av))
            line1 = "★ Tipp merken!"
            line2 = "Speichern & Teilen"
            b1 = d.textbbox((0,0), line1, font=F(18))
            b2 = d.textbbox((0,0), line2, font=F(13, reg=True))
            d.text((hx + (hw-(b1[2]-b1[0]))//2, hy + 6),  line1, fill=(*BLACK, av), font=F(18))
            d.text((hx + (hw-(b2[2]-b2[0]))//2, hy + 29), line2, fill=(*DARK,  av), font=F(13, reg=True))

    # ── 6. END SCREEN CTA (bottom banner, from ~204 s) ────────────────────────
    if t >= 204:
        lt = min((t - 204) / 3.0, 1.0)
        av = int(ease_out(lt) * 232)

        ovl = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
        od  = ImageDraw.Draw(ovl)
        bh  = 74
        by  = HEIGHT - bh

        od.rectangle([0, by, WIDTH, HEIGHT], fill=(*BLACK, av))
        od.rectangle([0, by, WIDTH, by + 3], fill=(*YELLOW, av))

        t1 = "Mehr Reise-Tipps?"
        t2 = "Kanal abonnieren  •  Glocke aktivieren  •  Video teilen"
        b1 = od.textbbox((0,0), t1, font=F(20))
        b2 = od.textbbox((0,0), t2, font=F(14, reg=True))
        od.text((WIDTH//2 - (b1[2]-b1[0])//2, by + 9),  t1, fill=(*YELLOW, av), font=F(20))
        od.text((WIDTH//2 - (b2[2]-b2[0])//2, by + 38), t2, fill=(*WHITE,  av), font=F(14, reg=True))

        img = Image.alpha_composite(img, ovl)

    return img


def main():
    INPUT  = "/root/.claude/uploads/da1fbdee-4e6c-4d52-bf67-74cffbdb9cfb/1d485f10-powerbankdefinalmusic_6_1.mp4"
    OUTPUT = "/home/user/video-use/powerbank_enhanced.mp4"

    cmd = [
        "ffmpeg", "-y",
        "-i", INPUT,
        # overlay input: raw RGBA at OVERLAY_FPS
        "-f", "rawvideo", "-pix_fmt", "rgba",
        "-s", f"{WIDTH}x{HEIGHT}", "-r", str(OVERLAY_FPS),
        "-i", "pipe:0",
        # ffmpeg will auto-duplicate overlay frames to match 30 fps source
        "-filter_complex",
        "[1:v]fps=30[ov];[0:v][ov]overlay=0:0[v]",
        "-map", "[v]", "-map", "0:a",
        "-c:v", "libx264", "-crf", "17", "-preset", "fast",
        "-pix_fmt", "yuv420p",
        "-c:a", "copy",
        OUTPUT,
    ]
    log = open("/tmp/ffmpeg_enhance.log", "w")
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=log)

    print(f"Rendering {TOTAL_FRAMES} overlay frames @ {OVERLAY_FPS} fps…")
    for n in range(TOTAL_FRAMES):
        frame = make_frame(n)
        proc.stdin.write(frame.tobytes())
        if n % (OVERLAY_FPS * 15) == 0:
            pct = 100 * n // TOTAL_FRAMES
            print(f"  [{pct:3d}%] frame {n}/{TOTAL_FRAMES}", flush=True)

    proc.stdin.close()
    ret = proc.wait()
    log.close()

    if ret == 0:
        size_mb = os.path.getsize(OUTPUT) / 1e6
        print(f"\nDone!  →  {OUTPUT}  ({size_mb:.1f} MB)")
    else:
        print(f"\nffmpeg failed (exit {ret}). Last lines of log:")
        with open("/tmp/ffmpeg_enhance.log") as f:
            lines = f.readlines()
        print("".join(lines[-30:]))

if __name__ == "__main__":
    main()
