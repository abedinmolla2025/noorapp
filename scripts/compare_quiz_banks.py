import json, re, unicodedata
from difflib import SequenceMatcher
from pathlib import Path
root=Path('/home/ubuntu/noorapp')
old=json.loads((root/'public/quiz-questions-90.json').read_text(encoding='utf-8'))
new=json.loads(Path('/home/ubuntu/upload/quiz-questions(3).json').read_text(encoding='utf-8'))
def norm(s):
 s=unicodedata.normalize('NFKC',str(s or '')).lower()
 s=s.replace('আ.', '').replace('(সা.)','').replace('(রা.)','')
 return re.sub(r'[^\w\u0980-\u09ff]+','',s)
def key(q): return norm(q.get('question_en') or q.get('question'))
def shape(q): return {'question':q.get('question',''),'question_en':q.get('question_en',''),'options':q.get('options',[]),'options_en':q.get('options_en',[]),'correct_answer':q.get('correct_answer'),'category':q.get('category'),'difficulty':q.get('difficulty','medium'),'is_active':True}
oldkeys={key(q):i for i,q in enumerate(old)}
newkeys={key(q):i for i,q in enumerate(new)}
print('OLD',len(old),'NEW',len(new),'EXACT_KEY_OVERLAP',len(set(oldkeys)&set(newkeys)))
for k in sorted(set(oldkeys)&set(newkeys)):
 print('EXACT',oldkeys[k]+1,newkeys[k]+1,old[oldkeys[k]].get('question_en'))
# near candidates with strong English similarity
near=[]
for j,b in enumerate(new):
 kb=key(b)
 if kb in oldkeys: continue
 best=(0,None)
 for i,a in enumerate(old):
  s=SequenceMatcher(None,kb,key(a)).ratio()
  if s>best[0]: best=(s,i)
 if best[0]>=0.72: near.append((best[0],best[1]+1,j+1,old[best[1]].get('question_en'),b.get('question_en')))
print('NEAR_COUNT',len(near))
for x in sorted(near,reverse=True): print('NEAR',x)
print('NEW_UNIQUE_CANDIDATES',len(new)-len(set(oldkeys)&set(newkeys)))
print('NEW_INVALID',sum(not isinstance(q.get('options'),list) or len(q.get('options',[]))!=4 or not isinstance(q.get('options_en'),list) or len(q.get('options_en',[]))!=4 or not isinstance(q.get('correct_answer'),int) or not 0<=q.get('correct_answer',-1)<4 for q in new))
