import json
import re
from pathlib import Path

local = json.loads(Path('/home/ubuntu/noorapp/public/quiz-questions-90.json').read_text())
result = json.loads(Path('/home/ubuntu/.mcp/tool-results/2026-08-24_10-29-08.787578372_supabase_execute_sql_9a87ffa6.json').read_text())
raw = result['result']
m = re.search(r'<untrusted-data-[^>]+>\n(.*?)\n</untrusted-data-[^>]+>', raw, re.S)
live = json.loads(m.group(1))

def norm(v): return re.sub(r'\s+', ' ', str(v or '').strip().lower())
def key(q): return norm(q.get('question_en') or q.get('question_bn') or q.get('question'))
local_by_key = {key(q): q for q in local}
live_by_key = {}
for q in live: live_by_key.setdefault(key(q), []).append(q)
missing = [q for k,q in local_by_key.items() if k not in live_by_key]

def lit(v): return "'" + str(v).replace("'", "''") + "'"
def json_lit(v): return lit(json.dumps(v, ensure_ascii=False, separators=(',', ':'))) + '::jsonb'

parts = [
"BEGIN;",
"WITH ranked AS (SELECT id, row_number() OVER (PARTITION BY lower(regexp_replace(trim(coalesce(question_en, question_bn, question)), '\\s+', ' ', 'g')) ORDER BY created_at ASC NULLS LAST, id ASC) AS rn FROM public.quiz_questions), doomed AS (SELECT id FROM ranked WHERE rn > 1 LIMIT 50) DELETE FROM public.quiz_questions WHERE id IN (SELECT id FROM doomed);",
]
for q in missing:
    bn = q.get('question_bn') or q.get('question')
    en = q.get('question_en')
    opts_bn = q.get('options_bn') or q.get('options') or []
    opts_en = q.get('options_en') or q.get('options') or []
    opts_legacy = q.get('options') or opts_bn
    category = q.get('category') or 'General'
    difficulty = q.get('difficulty') or 'medium'
    parts.append(
        "INSERT INTO public.quiz_questions (question, options, correct_answer, category, difficulty, is_active, question_bn, question_en, options_bn, options_en) VALUES ("
        + ', '.join([lit(bn), json_lit(opts_legacy), str(int(q.get('correct_answer', 0))), lit(category), lit(difficulty), 'true', lit(bn), lit(en), json_lit(opts_bn), json_lit(opts_en)])
        + ");"
    )
parts += ["COMMIT;"]
out = Path('/home/ubuntu/noorapp/tmp_quiz_merge.sql')
out.write_text('\n'.join(parts) + '\n')
print(json.dumps({'missing_to_insert': len(missing), 'sql_path': str(out)}, ensure_ascii=False))
