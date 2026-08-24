import json
import re
from pathlib import Path

local_path = Path('/home/ubuntu/noorapp/public/quiz-questions-90.json')
result_path = Path('/home/ubuntu/.mcp/tool-results/2026-08-24_10-29-08.787578372_supabase_execute_sql_9a87ffa6.json')
out_path = Path('/home/ubuntu/noorapp/quiz_merge_report.json')

local = json.loads(local_path.read_text())
outer = json.loads(result_path.read_text())
raw = outer['result']
match = re.search(r'<untrusted-data-[^>]+>\n(.*?)\n</untrusted-data-[^>]+>', raw, re.S)
if not match:
    raise RuntimeError('Could not parse Supabase result envelope')
live = json.loads(match.group(1))

def norm(value):
    if value is None:
        return ''
    return re.sub(r'\s+', ' ', str(value).strip().lower())

def key(q):
    return norm(q.get('question_en') or q.get('question_bn') or q.get('question'))

local_keys = {}
for q in local:
    local_keys.setdefault(key(q), []).append(q)
live_keys = {}
for q in live:
    live_keys.setdefault(key(q), []).append(q)

local_dupes = {k: len(v) for k, v in local_keys.items() if k and len(v) > 1}
live_dupes = {k: len(v) for k, v in live_keys.items() if k and len(v) > 1}
missing_from_live = [q for k, qs in local_keys.items() if k not in live_keys for q in qs]
not_in_local = [q for k, qs in live_keys.items() if k not in local_keys for q in qs]

report = {
    'local_total': len(local),
    'live_total': len(live),
    'local_unique_keys': len([k for k in local_keys if k]),
    'live_unique_keys': len([k for k in live_keys if k]),
    'overlap_unique_keys': len(set(local_keys) & set(live_keys)),
    'missing_from_live_count': len(missing_from_live),
    'not_in_local_count': len(not_in_local),
    'local_duplicate_groups': local_dupes,
    'live_duplicate_groups': live_dupes,
    'missing_from_live': missing_from_live,
    'not_in_local': not_in_local,
}
out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2))
print(json.dumps({k: report[k] for k in ['local_total','live_total','local_unique_keys','live_unique_keys','overlap_unique_keys','missing_from_live_count','not_in_local_count']}, ensure_ascii=False, indent=2))
print('local_duplicate_groups=', len(local_dupes), 'live_duplicate_groups=', len(live_dupes))
