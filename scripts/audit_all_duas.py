import json
import re
from collections import Counter
from pathlib import Path

path = Path('/home/ubuntu/noorapp/public/data/duas.json')
rows = json.loads(path.read_text())

text_keys = ('arabic', 'pronunciation', 'translation_bn', 'translation_en', 'when_to_recite_bn', 'when_to_recite_en', 'virtue', 'hook', 'share_text')
issues = []
missing = []
slug_counts = Counter(row.get('slug') for row in rows)
for index, row in enumerate(rows):
    row_id = row.get('slug') or f'index-{index}'
    for key in text_keys:
        value = row.get(key)
        if isinstance(value, dict):
            values = value.items()
        else:
            values = [(key, value)]
        for subkey, text in values:
            if not isinstance(text, str) or not text.strip():
                continue
            if re.search(r'\\+n|\\+r', text):
                issues.append((row_id, subkey, 'escaped-newline', repr(text[:220])))
            lines = [line.strip() for line in re.split(r'\\+n|\\r?\\n|\\+r', text) if line.strip()]
            for left, right in zip(lines, lines[1:]):
                if left == right:
                    issues.append((row_id, subkey, 'consecutive-duplicate', repr(left)))
    required = ('slug', 'title_bn')
    for key in required:
        if not str(row.get(key) or '').strip():
            missing.append((row_id, key, 'missing-required', ''))

print(f'total_records={len(rows)}')
print(f'duplicate_slugs={sum(count - 1 for count in slug_counts.values() if count > 1)}')
print(f'formatting_issues={len(issues)}')
print(f'missing_identity_fields={len(missing)}')
for item in missing:
    print('\t'.join(item))
print('--- formatting issues ---')
for item in issues:
    print('\t'.join(item))
