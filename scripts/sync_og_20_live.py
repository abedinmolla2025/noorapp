import json
from pathlib import Path
import os
import requests

ROOT=Path('/home/ubuntu/noorapp')
SUPABASE_URL='https://llicfiepatzgllmjhzbw.supabase.co'
SUPABASE_KEY = os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY")
if not SUPABASE_KEY:
    raise SystemExit("Missing SUPABASE_ANON_KEY env var (M-07: no committed key literal)")
headers={'apikey':SUPABASE_KEY,'Authorization':f'Bearer {SUPABASE_KEY}','Content-Type':'application/json','Prefer':'return=representation'}
rows=json.loads((ROOT/'public/data/duas.json').read_text())
selected=[]
for r in rows:
    u=(r.get('og_image_data') or {}).get('og_image_url','')
    if u.startswith('/assets/dua-og/'):
        selected.append(r)
assert len(selected)==20
for r in selected:
    slug=r['slug']
    image_url=f'https://noorapp.in/assets/dua-og/{slug}.webp'
    body={'image_url':image_url}
    resp=requests.patch(f'{SUPABASE_URL}/rest/v1/admin_content',params={'slug':f'eq.{slug}'},headers=headers,json=body,timeout=30)
    if resp.status_code >= 300:
        raise RuntimeError(f'{slug}: {resp.status_code} {resp.text[:500]}')
    if not resp.json():
        raise RuntimeError(f'{slug}: no row updated')
    print(slug, resp.status_code, image_url)
print('synced=',len(selected))
