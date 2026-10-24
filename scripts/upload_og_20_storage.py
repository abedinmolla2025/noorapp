from pathlib import Path
import os
import requests

ROOT=Path('/home/ubuntu/noorapp')
BASE='https://llicfiepatzgllmjhzbw.supabase.co'
KEY = os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY")
if not KEY:
    raise SystemExit("Missing SUPABASE_ANON_KEY env var (M-07: no committed key literal)")
headers={'apikey':KEY,'Authorization':f'Bearer {KEY}','Content-Type':'image/webp','x-upsert':'true','cache-control':'public,max-age=31536000,immutable'}
files=sorted((ROOT/'public/assets/dua-og').glob('*.webp'))
assert len(files)==21, len(files)
for p in files:
    path=f'dua-og/{p.name}'
    r=requests.post(f'{BASE}/storage/v1/object/media/{path}',headers=headers,data=p.read_bytes(),timeout=60)
    if r.status_code >= 300:
        raise RuntimeError(f'{path}: {r.status_code} {r.text[:500]}')
    print(path, r.status_code)
print('uploaded=',len(files))
