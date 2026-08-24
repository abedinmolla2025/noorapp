import json
import re
from pathlib import Path

rows = json.loads(Path('/home/ubuntu/noorapp/public/data/duas.json').read_text())
arabic_re = re.compile(r'[\u0600-\u06ff]')
latin_re = re.compile(r'[A-Za-z]')
issues = []
for i, row in enumerate(rows, 1):
    slug = str(row.get('slug') or '')
    title = str(row.get('title_bn') or '')
    arabic = str(row.get('arabic') or '').strip()
    if not slug:
        issues.append((i, slug, 'missing-slug', title))
    if not arabic:
        issues.append((i, slug, 'missing-arabic', title))
    elif not arabic_re.search(arabic):
        issues.append((i, slug, 'no-arabic-script', arabic[:100]))
    elif latin_re.search(arabic):
        issues.append((i, slug, 'latin-mixed-into-arabic', arabic[:160]))
    if '\\n' in arabic or '\\r' in arabic:
        issues.append((i, slug, 'escaped-linebreak', repr(arabic)))
    if arabic and len(arabic) < 8:
        issues.append((i, slug, 'very-short-arabic', arabic))

print(f'total_records={len(rows)}')
print(f'with_arabic={sum(bool(str(r.get("arabic") or "").strip()) for r in rows)}')
print(f'issues={len(issues)}')
for issue in issues:
    print('\t'.join(map(str, issue)))
