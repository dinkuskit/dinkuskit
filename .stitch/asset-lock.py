#!/usr/bin/env python3
"""Pin the owner's real brand images back into Stitch variant HTML.

Stitch's variant generator swaps every <img> source for a generated image
(lh3.googleusercontent.com/aida-public/...), even with LAYOUT-only aspects and
public source URLs. The alt text and data-asset attributes survive, so each
image is matched back to an asset in .stitch/assets.json and its src is reset.

  python3 .stitch/asset-lock.py <variant.html> [...] [--out-dir DIR]

Writes <name>.locked.html (or into --out-dir) and prints one line per image.
Exits 1 when an image matches no asset, so a round with an unexplained image
is never shown as-is.
"""
import argparse, json, pathlib, sys
from bs4 import BeautifulSoup

HERE = pathlib.Path(__file__).resolve().parent
manifest = json.loads((HERE / 'assets.json').read_text())
assets = {a['id']: a for a in manifest['assets']}
# Plugin names first: "F3" and "DinkusKit" appear in almost every alt.
order = ['commerce', 'payments', 'inventory', 'ship', 'f3-trio', 'f3-cube']

def pick(img):
    if img.get('data-asset') in assets:
        return img['data-asset']
    alt = (img.get('alt') or '').lower()
    for asset_id in order[:4]:
        if any(word in alt for word in assets[asset_id]['match']):
            return asset_id
    if img.find_parent('header') or any(word in alt for word in assets['f3-trio']['match']):
        return 'f3-trio'
    if any(word in alt for word in assets['f3-cube']['match']):
        return 'f3-cube'
    return None

def lock(path, out_dir):
    soup = BeautifulSoup(path.read_text(), 'html.parser')
    unmatched = 0
    for img in soup.find_all('img'):
        asset_id = pick(img)
        if not asset_id:
            unmatched += 1
            print(f'{path.name}: NO MATCH alt="{img.get("alt", "")}" src={img.get("src", "")[:60]}')
            continue
        asset = assets[asset_id]
        img['src'] = manifest['base'] + asset['path']
        img['data-asset'] = asset_id
        img['alt'] = asset['alt']
        style = img.get('style', '')
        if 'object-fit' not in style:
            img['style'] = (style + ';' if style else '') + 'object-fit:contain'
        print(f'{path.name}: {asset_id}')
    target = (out_dir or path.parent) / path.name.replace('.html', '.locked.html')
    target.write_text(str(soup))
    return unmatched

parser = argparse.ArgumentParser()
parser.add_argument('files', nargs='+', type=pathlib.Path)
parser.add_argument('--out-dir', type=pathlib.Path)
args = parser.parse_args()
missing = sum(lock(path, args.out_dir) for path in args.files)
sys.exit(1 if missing else 0)
