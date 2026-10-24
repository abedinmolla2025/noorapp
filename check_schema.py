import os

import requests

# M-07: anon key from env only (no committed literal).
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY")
if not SUPABASE_ANON_KEY:
    raise SystemExit("Missing SUPABASE_ANON_KEY env var")
import json

url = "https://llicfiepatzgllmjhzbw.supabase.co/rest/v1/"
headers = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": f"Bearer {SUPABASE_ANON_KEY}"
}

def check_table(table):
    try:
        r = requests.get(url + table + "?limit=1", headers=headers)
        print(f"Table {table}: {r.status_code}")
        if r.status_code == 200:
            print(f"Sample data from {table}: {json.dumps(r.json(), indent=2)}")
        else:
            print(f"Error checking {table}: {r.text}")
    except Exception as e:
        print(f"Exception checking {table}: {e}")

tables = ["quran_surahs", "quran_ayahs", "hadith_books", "hadith_chapters", "hadiths", "duas", "stories"]
for t in tables:
    check_table(t)
