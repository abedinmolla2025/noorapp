import os

import requests

# M-07: anon key from env only (no committed literal).
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY")
if not SUPABASE_ANON_KEY:
    raise SystemExit("Missing SUPABASE_ANON_KEY env var")

url = "https://llicfiepatzgllmjhzbw.supabase.co/rest/v1/hadith_chapters"
headers = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": f"Bearer {SUPABASE_ANON_KEY}"
}
params = {
    "book_id": "eq.bukhari",
    "order": "hadith_count.desc",
    "limit": 1
}
r = requests.get(url, headers=headers, params=params)
print(r.json())
