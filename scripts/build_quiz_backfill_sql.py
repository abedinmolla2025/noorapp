import json, re
from pathlib import Path
local=json.loads(Path('/home/ubuntu/noorapp/public/quiz-questions-90.json').read_text())
res=json.loads(Path('/home/ubuntu/.mcp/tool-results/2026-08-24_10-29-08.787578372_supabase_execute_sql_9a87ffa6.json').read_text())
m=re.search(r'<untrusted-data-[^>]+>\n(.*?)\n</untrusted-data-[^>]+>',res['result'],re.S)
live=json.loads(m.group(1))
def norm(v): return re.sub(r'\s+',' ',str(v or '').strip().lower())
def key(q): return norm(q.get('question_en') or q.get('question_bn') or q.get('question'))
local_by_key={key(q):q for q in local}
def lit(v): return "'"+str(v).replace("'","''")+"'"
def jl(v): return lit(json.dumps(v,ensure_ascii=False,separators=(',',':')))+'::jsonb'
parts=['BEGIN;']
count=0
for row in live:
    q=local_by_key.get(key(row))
    if not q: continue
    bn=q.get('question_bn') or q.get('question')
    en=q.get('question_en') or row.get('question_en')
    ob=q.get('options_bn') or q.get('options') or []
    oe=q.get('options_en') or q.get('options') or []
    legacy=q.get('options') or ob
    parts.append("UPDATE public.quiz_questions SET question="+lit(bn)+", options="+jl(legacy)+", question_bn="+lit(bn)+", question_en="+lit(en)+", options_bn="+jl(ob)+", options_en="+jl(oe)+", updated_at=now() WHERE id="+lit(row['id'])+";")
    count+=1
parts += ['COMMIT;']
Path('/home/ubuntu/noorapp/tmp_quiz_backfill.sql').write_text('\n'.join(parts)+'\n')
print(json.dumps({'updated_rows':count,'sql_lines':len(parts)}))
