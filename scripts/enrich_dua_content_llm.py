import json, re, time, concurrent.futures as cf
from pathlib import Path
from openai import OpenAI
root=Path('/home/ubuntu/noorapp'); data_path=root/'public/data/duas.json'; rows=json.loads(data_path.read_text()); client=OpenAI(timeout=90, max_retries=2)
schema={'type':'object','additionalProperties':False,'properties':{'translation_bn':{'type':'string'},'when_to_recite_bn':{'type':'string'},'benefits':{'type':'array','items':{'type':'string'},'minItems':2,'maxItems':3}},'required':['translation_bn','when_to_recite_bn','benefits']}
def needs(r): return not (r.get('translation_bn') or '').strip() or not (r.get('when_to_recite_bn') or '').strip() or not r.get('benefits')
def job(item):
 idx,r=item
 prompt=f'''Enrich this one Islamic Dua record for a Bengali educational website. Return JSON only with accurate natural Bengali fields: translation_bn (faithful meaning, not transliteration), when_to_recite_bn (1–2 specific sentences; do not invent a prescribed time), benefits (2–3 specific spiritual/educational benefits; no medical promises, guaranteed outcomes, or unsupported fadilah). Be careful to distinguish Quran verses from Hadith/general remembrance and use only the supplied source information. Avoid generic repeated wording.
Title: {r.get('title_bn','')}
Arabic: {r.get('arabic','')}
Source type: {r.get('source_type','')}
Reference: {r.get('reference','')}
Authenticity: {r.get('authenticity','')}'''
 resp=client.chat.completions.create(model='gpt-5-mini',messages=[{'role':'system','content':'You are a careful Bengali Islamic editor. Output valid JSON only and never fabricate religious claims.'},{'role':'user','content':prompt}],response_format={'type':'json_schema','json_schema':{'name':'dua_enrichment','strict':True,'schema':schema}},max_completion_tokens=1200)
 return idx,json.loads(resp.choices[0].message.content)
todo=[(i,r) for i,r in enumerate(rows) if needs(r)]
print('TODO',len(todo),flush=True)
results={}
with cf.ThreadPoolExecutor(max_workers=6) as ex:
 futs={ex.submit(job,item):item[0] for item in todo}
 for fut in cf.as_completed(futs):
  idx=futs[fut]; n=idx+1; out=fut.result(); results[idx]=out[1]; print('DONE',n,rows[idx].get('title_bn',''),flush=True)
for idx,out in results.items():
 r=rows[idx]
 if not (r.get('translation_bn') or '').strip(): r['translation_bn']=out['translation_bn'].strip()
 if not (r.get('when_to_recite_bn') or '').strip(): r['when_to_recite_bn']=out['when_to_recite_bn'].strip()
 if not r.get('benefits'): r['benefits']=[x.strip() for x in out['benefits'] if x.strip()]
data_path.write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
print('SAVED',len(results),data_path,flush=True)
