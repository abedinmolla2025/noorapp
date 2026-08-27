import csv, json
from pathlib import Path

root = Path('/home/ubuntu/noorapp')
records = json.loads((root / 'public/data/duas.json').read_text(encoding='utf-8'))
manifest_path = root / 'dua_214_r2_manifest.tsv'
rows = list(csv.DictReader(manifest_path.open(encoding='utf-8'), delimiter='\t'))
assert len(records) >= 218, f'expected at least 218 production duas, got {len(records)}'
assert len(rows) == 214, len(rows)
slugs = [r.get('slug') for r in records[:218]]
assert all(isinstance(s, str) and s.strip() for s in slugs), 'missing production slug'
assert len(set(slugs)) == len(slugs), 'duplicate production slugs'
numbers = []
for row in rows:
    number = int(row['source_name'][:3])
    assert 1 <= number <= 218, f'invalid source number: {number}'
    numbers.append(number)
assert len(numbers) == len(set(numbers)), 'duplicate source numbers in unique manifest'
for row, number in zip(rows, numbers):
    row['r2_key'] = f"duas/{number:03d}-{slugs[number-1]}.mp3"
    row['extension'] = 'mp3'
    row['content_type'] = 'audio/mpeg'
    row['source_url'] = ''
with manifest_path.open('w', encoding='utf-8', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=['source_name','source_url','r2_key','extension','content_type','sha256','bytes'], delimiter='\t', lineterminator='\n')
    writer.writeheader(); writer.writerows(rows)
print(json.dumps({'production_records_checked': 218, 'manifest_rows': len(rows), 'unique_production_slugs': len(set(slugs)), 'source_numbers': numbers, 'status': 'mapped_to_english_slugs'}, ensure_ascii=False, indent=2))
