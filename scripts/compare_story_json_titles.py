import json
from pathlib import Path

left = json.loads(Path('/home/ubuntu/noorapp/imported/updated_stories.json').read_text())
right = json.loads(Path('/home/ubuntu/noorapp/public/stories.json').read_text())
fields = ('slug', 'title_bn', 'title_en')
left_map = {r.get('slug'): {f: r.get(f) for f in fields} for r in left}
right_map = {r.get('slug'): {f: r.get(f) for f in fields} for r in right}
print('left_records', len(left), 'right_records', len(right))
print('same_slug_set', set(left_map) == set(right_map))
diffs = []
for slug in sorted(set(left_map) | set(right_map)):
    if left_map.get(slug) != right_map.get(slug):
        diffs.append((slug, left_map.get(slug), right_map.get(slug)))
print('title_slug_differences', len(diffs))
for item in diffs[:20]:
    print(item)
