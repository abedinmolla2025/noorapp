from pathlib import Path
import json
from PIL import Image

ROOT=Path('/home/ubuntu/noorapp')
OUT=ROOT/'public/assets/dua-og'
OUT.mkdir(parents=True, exist_ok=True)
source_dirs=[Path('/home/ubuntu/og_generated_batch1'),Path('/home/ubuntu/og_generated_batch2'),Path('/home/ubuntu/og_generated_batch3'),Path('/home/ubuntu/og_generated_batch4')]
slug_map={
 'ism-e-azam-dua':'ইসমে-আযমের-দোয়া-অত্যন্ত-ফজিলতপূর্ণ',
 'dua-for-guidance-surah-al-faatiha-1-6':'surah-al-fatihah',
}
files=[]
for d in source_dirs:
    for p in d.glob('*.png'):
        slug=slug_map.get(p.stem,p.stem)
        dest=OUT/f'{slug}.webp'
        im=Image.open(p).convert('RGB')
        im.save(dest,'WEBP',quality=92,method=6)
        files.append((slug,str(dest.relative_to(ROOT))))
# Ensure one-to-one mapping
assert len(files)==20 and len({s for s,_ in files})==20
path_map=dict(files)
data_path=ROOT/'public/data/duas.json'
rows=json.loads(data_path.read_text())
by_slug={r.get('slug'):r for r in rows}
missing=[]
for slug,rel in path_map.items():
    if slug not in by_slug: missing.append(slug); continue
    r=by_slug[slug]
    og=r.get('og_image_data') if isinstance(r.get('og_image_data'),dict) else {}
    og['og_image_url']='/assets/dua-og/'+Path(rel).name
    r['og_image_data']=og
if missing: raise SystemExit('Missing slugs: '+','.join(missing))
data_path.write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
print('integrated=',len(files))
for slug,rel in sorted(files): print(slug, '/assets/dua-og/'+Path(rel).name)
