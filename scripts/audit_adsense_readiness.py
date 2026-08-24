import json, re
from collections import Counter
from pathlib import Path
root=Path('/home/ubuntu/noorapp')
rows=json.loads((root/'public/data/duas.json').read_text())

def filled(v):
    return v is not None and ((len(v.strip())>0) if isinstance(v,str) else (len(v)>0 if isinstance(v,(list,dict)) else bool(v)))
def val(r,k): return r.get(k)
print('records',len(rows))
for f in ['slug','title_bn','arabic','translation_bn','pronunciation','when_to_recite_bn','benefits','reference','source_type','authenticity','audio_url','og_image_data','seo']:
 print(f, sum(filled(val(r,f)) for r in rows), '/', len(rows))
for f in ['slug','title_bn','arabic','translation_bn','when_to_recite_bn','reference']:
 vals=[str(val(r,f) or '').strip() for r in rows]; c=Counter(v for v in vals if v)
 print('DUP',f,'unique',len(c),'duplicate_groups',sum(x>1 for x in c.values()),'duplicate_records',sum(x-1 for x in c.values() if x>1))
print('short_arabic_under_40',sum(len(str(r.get('arabic') or '').strip())<40 for r in rows))
print('short_translation_under_80',sum(len(str(r.get('translation_bn') or '').strip())<80 for r in rows))
print('escaped_newline_any',sum(bool(re.search(r'\\n|\\r',json.dumps(r,ensure_ascii=False))) for r in rows))
print('missing_core_by_record')
for i,r in enumerate(rows,1):
 miss=[f for f in ['arabic','translation_bn','when_to_recite_bn','reference'] if not filled(r.get(f))]
 if miss: print(i, r.get('title_bn'), ','.join(miss))
