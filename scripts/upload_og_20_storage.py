from pathlib import Path
import requests

ROOT=Path('/home/ubuntu/noorapp')
BASE='https://llicfiepatzgllmjhzbw.supabase.co'
KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsaWNmaWVwYXR6Z2xsbWpoemJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0ODA4MDksImV4cCI6MjA4NDA1NjgwOX0.T7xnXRSM2jx92gVH8Of1dePj609C7WKKflv2I_VZpy0'
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
