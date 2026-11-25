# Cherche des photos libres (Wikimedia Commons et Openverse) pour chaque plat
# et enregistre jusqu'a 8 candidats carres par plat dans cand/<plat>/.
import json, os, io, sys, urllib.parse, urllib.request
from PIL import Image
UA = {'User-Agent': 'WAYI-menu-images/1.0 (https://www.wayibenin.com; contact@wayibenin.com)'}
def get(url, raw=False):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        b = r.read()
    return b if raw else json.loads(b)
def commons(q, n=3):
    u = 'https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode({
        'action': 'query', 'generator': 'search', 'gsrsearch': f'filetype:bitmap {q}', 'gsrnamespace': 6,
        'gsrlimit': n, 'prop': 'imageinfo', 'iiprop': 'url|extmetadata', 'iiurlwidth': 900, 'format': 'json'})
    out = []
    for p in sorted((get(u).get('query') or {}).get('pages', {}).values(), key=lambda p: p.get('index', 0)):
        ii = (p.get('imageinfo') or [{}])[0]
        md = ii.get('extmetadata') or {}
        out.append({'src': ii.get('thumburl') or ii.get('url'), 'page': ii.get('descriptionurl'),
                    'licence': (md.get('LicenseShortName') or {}).get('value', ''), 'auteur': (md.get('Artist') or {}).get('value', '')})
    return out
def openverse(q, n=3):
    u = 'https://api.openverse.org/v1/images/?' + urllib.parse.urlencode({'q': q, 'page_size': n, 'license_type': 'commercial', 'mature': 'false'})
    return [{'src': r.get('url'), 'page': r.get('foreign_landing_url'), 'licence': f"{r.get('license','')} {r.get('license_version','')}".strip(), 'auteur': r.get('creator') or ''}
            for r in get(u).get('results', [])]
def square(b, size=800):
    im = Image.open(io.BytesIO(b)).convert('RGB')
    w, h = im.size; s = min(w, h)
    im = im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s)).resize((size, size), Image.LANCZOS)
    o = io.BytesIO(); im.save(o, 'JPEG', quality=82, optimize=True); return o.getvalue()
plan = json.load(open(sys.argv[1]))
meta = {}
for slug, queries in plan.items():
    os.makedirs(f'cand/{slug}', exist_ok=True)
    found = []
    for q in queries:
        for fn in (openverse, commons):
            try: found += fn(q)
            except Exception as e: print('  recherche', slug, q, e)
    seen, k = set(), 0
    for c in found:
        if not c['src'] or c['src'] in seen or k >= 8: continue
        seen.add(c['src'])
        try:
            open(f'cand/{slug}/{k}.jpg', 'wb').write(square(get(c['src'], raw=True)))
            meta[f'{slug}/{k}'] = c; k += 1
        except Exception as e: print('  image', slug, e)
    print(slug, k, 'candidats')
json.dump(meta, open('cand/meta.json', 'w'), ensure_ascii=False, indent=1)
