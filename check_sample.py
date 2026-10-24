import os

import requests

# M-07: anon key from env only (no committed literal).
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY")
if not SUPABASE_ANON_KEY:
    raise SystemExit("Missing SUPABASE_ANON_KEY env var")

url = "https://llicfiepatzgllmjhzbw.supabase.co/rest/v1/hadiths"
headers = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": f"Bearer {SUPABASE_ANON_KEY}"
}
params = {
    "book_key": "eq.bukhari",
    "bengali": "not.is.null",
    "select": "hadith_number,arabic,bengali",
    "limit": 5
}
r = requests.get(url, headers=headers, params=params)
print(f"Status: {r.status_code}")
print(f"Data: {r.json()}")
