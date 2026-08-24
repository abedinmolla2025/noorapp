import json, re
from pathlib import Path

local=json.loads(Path('/home/ubuntu/noorapp/public/data/duas.json').read_text())
res=json.loads(Path('/home/ubuntu/.mcp/tool-results/2026-08-24_10-36-23.118340726_supabase_execute_sql_0513bb1f.json').read_text())
m=re.search(r'<untrusted-data-[^>]+>\n(.*?)\n</untrusted-data-[^>]+>',res['result'],re.S)
live=json.loads(m.group(1))

def lit(v): return 'NULL' if v is None else "'"+str(v).replace("'","''")+"'"
def arr(v): return 'NULL' if v is None else lit(json.dumps(v,ensure_ascii=False,separators=(',',':')))+'::jsonb'
def pgarr(v):
    if v is None: return 'NULL'
    if len(v) == 0: return "ARRAY[]::text[]"
    return 'ARRAY['+', '.join(lit(x) for x in v)+']'

def sqlval(field,v):
    if field in {'emotion','normalized_surah_names','user_intents','recommendation_tags','recommended_moments','semantic_entities','related_duas','hook_variants','benefits_bn','benefits_en','benefits_hi','benefits_ur'}:
        return pgarr(v)
    if field in {'search_aliases','social','og_image_data','seo','quran_meta','category_hierarchy','faq'}:
        return arr(v)
    return lit(v)

local_by_slug={q['slug']:q for q in local if q.get('slug')}
live_by_slug={r.get('slug'):r for r in live if r.get('slug')}
missing=[s for s in local_by_slug if s not in live_by_slug]
# Do not touch audio_url; audio remains unpublished by explicit project requirement.
fields=['title','title_arabic','content','content_arabic','content_pronunciation','title_en','title_hi','title_ur','content_en','content_hi','content_ur','content_pronunciation_en','content_pronunciation_hi','content_pronunciation_ur','explanation_bn','benefits_bn','when_to_recite_bn','hadith_reference','explanation_en','explanation_hi','explanation_ur','benefits_en','benefits_hi','benefits_ur','when_to_recite_en','subtitle','source_type','reference','authenticity','difficulty','time_required','hook','share_text','virtue','virtue_reference','legacy_slug','viral_score','emotion','normalized_surah_names','user_intents','recommendation_tags','recommended_moments','semantic_entities','related_duas','hook_variants','search_aliases','social','og_image_data','seo','quran_meta','category_hierarchy','faq']
parts=['BEGIN;']
updated=0
for slug,q in local_by_slug.items():
    row=live_by_slug.get(slug)
    if not row: continue
    assigns=[]
    for f in fields:
        if f=='title': v=q.get('title_bn') or row.get('title')
        elif f=='content': v=q.get('translation_bn') or row.get('content')
        elif f=='content_pronunciation': v=(q.get('pronunciation') or {}).get('bn') or row.get('content_pronunciation')
        elif f=='content_pronunciation_en': v=(q.get('pronunciation') or {}).get('en') or row.get('content_pronunciation_en')
        elif f=='content_pronunciation_hi': v=(q.get('pronunciation') or {}).get('hi') or row.get('content_pronunciation_hi')
        elif f=='content_pronunciation_ur': v=(q.get('pronunciation') or {}).get('ur') or row.get('content_pronunciation_ur')
        elif f=='title_arabic': v=q.get('title_arabic')
        elif f=='content_arabic': v=q.get('arabic')
        elif f=='title_en': v=q.get('title_en')
        elif f=='content_en': v=q.get('translation_en')
        else: v=q.get(f, row.get(f))
        # Only write fields represented in local data or mapped above; preserve other existing values.
        if v is not None:
            assigns.append(f+"="+sqlval(f,v))
    assigns.append('updated_at=now()')
    parts.append('UPDATE public.admin_content SET '+', '.join(assigns)+' WHERE id='+lit(row['id'])+' AND content_type=\'dua\';')
    updated+=1
parts.append('COMMIT;')
Path('/home/ubuntu/noorapp/tmp_dua_sync.sql').write_text('\n'.join(parts)+'\n')
Path('/home/ubuntu/noorapp/dua_sync_report.json').write_text(json.dumps({'local_total':len(local),'live_dua_total':len(live),'matched':updated,'missing_slugs':missing,'audio_url_updated':False},ensure_ascii=False,indent=2))
print(json.dumps({'local_total':len(local),'live_dua_total':len(live),'matched':updated,'missing_slugs':len(missing),'sql_lines':len(parts),'audio_url_updated':False},ensure_ascii=False))
