import sys, subprocess
from PIL import Image, ImageOps
import numpy as np
E = "/Users/pedropacheco1/levapp-pad569-evidence/"
def load(name): return np.asarray(Image.open(E + name).convert("RGB")).astype(int)
def blue_rows(a):
    # own-message bubbles: the primary blue (~#1D4ED8 family): b high, r low, b > g
    r,g,b = a[...,0], a[...,1], a[...,2]
    mask = (b > 150) & (r < 90) & (b - g > 60)
    return mask[:, 600:1200].sum(axis=1)  # right column where own bubbles sit
def composer_top(a):
    # the composer input is a light grey rounded box (#E5E7EB-ish) spanning x 30..1050; find its top edge
    # in the band below the thread: scan from bottom for a row whose middle 800px are all light grey
    r,g,b = a[...,0], a[...,1], a[...,2]
    grey = (abs(r-g) < 8) & (abs(g-b) < 10) & (r > 215) & (r < 245)
    rows = grey[:, 150:1000].mean(axis=1)
    ys = np.where(rows > 0.95)[0]
    # the input box is the first long run of such rows; return its first row
    for i in range(len(ys)):
        if i + 40 < len(ys) and ys[i+40] - ys[i] == 40: return int(ys[i])
    return -1
def last_bubble_bottom(a, limit):
    br = blue_rows(a)
    ys = np.where(br[:limit] > 40)[0]
    return int(ys.max()) if len(ys) else -1
def shift(a1, a2, lo=400, hi=1400):
    # vertical offset d such that a2[y] matches a1[y+d] over a thread band
    b1, b2 = blue_rows(a1).astype(float), blue_rows(a2).astype(float)
    best = (None, -1)
    seg = b2[lo:hi]
    for d in range(0, 1300):
        if hi + d > len(b1): break
        c = np.corrcoef(seg, b1[lo+d:hi+d])[0,1]
        if c > best[1]: best = (d, c)
    return best
def ocr_last(name, y_bottom):
    im = Image.open(E + name).convert("L").crop((600, max(0, y_bottom-140), 1200, y_bottom+10))
    im = ImageOps.invert(im).point(lambda p: 255 if p > 120 else 0).resize((im.width*2, im.height*2))
    im.save("/tmp/ocr-crop.png")
    out = subprocess.run(["tesseract","/tmp/ocr-crop.png","-","--psm","7"],capture_output=True).stdout.decode("utf-8","replace").strip()
    return out
for label, one, two in (("BRANCH", "pad569-1-at-bottom.png", "pad569-2-keyboard-open.png"),
                        ("STAGING control", "control-pad569-1-at-bottom.png", "control-pad569-2-keyboard-open.png")):
    a1, a2 = load(one), load(two)
    ct2 = composer_top(a2); ct1 = composer_top(a1)
    lb2 = last_bubble_bottom(a2, ct2); lb1 = last_bubble_bottom(a1, ct1)
    d, c = shift(a1, a2)
    print(f"== {label}")
    print(f"  at bottom:     composer top y={ct1}  last visible bubble bottom y={lb1}  ({ocr_last(one, lb1)!r})")
    print(f"  keyboard open: composer top y={ct2}  last visible bubble bottom y={lb2}  gap={ct2-lb2}px  ({ocr_last(two, lb2)!r})")
    print(f"  content shift between the two frames: {d}px (corr {c:.3f}); keyboard+composer raised the composer by {ct1-ct2}px")
