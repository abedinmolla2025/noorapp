import json, shutil
from pathlib import Path
root=Path('/home/ubuntu/noorapp')
old_path=root/'public/quiz-questions-90.json'; incoming=Path('/home/ubuntu/upload/quiz-questions(3).json')
backup=old_path.with_suffix('.before-merge.json')
shutil.copy2(old_path,backup)
old=json.loads(old_path.read_text(encoding='utf-8')); new=json.loads(incoming.read_text(encoding='utf-8'))
# Exact duplicates found by normalized English question.
# Near-duplicates reviewed as the same question despite spelling/wording changes.
skip_new_1based={4,6,8,10,16,19,23,26,35,58,69,114}

def normalize(q): return ''.join(ch.lower() for ch in (q.get('question_en') or q.get('question') or '') if ch.isalnum())
old_keys={normalize(q) for q in old}
merged=list(old); added=[]; skipped=[]
for i,q in enumerate(new,1):
 if i in skip_new_1based or normalize(q) in old_keys:
  skipped.append(i); continue
 if not isinstance(q.get('options'),list) or len(q['options'])!=4: continue
 if not isinstance(q.get('options_en'),list) or len(q['options_en'])!=4: continue
 if not isinstance(q.get('correct_answer'),int) or not 0<=q['correct_answer']<4: continue
 q=dict(q); q['is_active']=True
 # The base question/options are Bengali in this file; make that explicit for the UI.
 if not (q.get('question_bn') or '').strip(): q['question_bn']=q.get('question','')
 if not isinstance(q.get('options_bn'),list) or len(q['options_bn'])!=4: q['options_bn']=q.get('options',[])
 merged.append(q); added.append(i); old_keys.add(normalize(q))
old_path.write_text(json.dumps(merged,ensure_ascii=False,indent=2)+'\n')
Path(root/'quiz_merge_report.json').write_text(json.dumps({'original_count':len(old),'incoming_count':len(new),'skipped_incoming_1based':sorted(skipped),'added_incoming_1based':added,'final_count':len(merged)},ensure_ascii=False,indent=2)+'\n')
print('original',len(old),'incoming',len(new),'skipped',len(skipped),'added',len(added),'final',len(merged))
print('backup',backup)
