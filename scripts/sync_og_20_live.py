import json
from pathlib import Path
import requests

ROOT=Path('/home/ubuntu/noorapp')
SUPABASE_URL='https://llicfiepatzgllmjhzbw.supabase.co'
SUPABASE_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxsaWNmaWVwYXR6Z2xsbWpoemJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0ODA4MDksImV4cCI6MjA4NDA1NjgwOX0.T7xnXRSM2jx92gVH8Of1dePj609C7WKKflv2I_VZpy0'
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
