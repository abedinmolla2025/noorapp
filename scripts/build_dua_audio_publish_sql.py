import csv
from pathlib import Path
root=Path('/home/ubuntu/noorapp')
rows=list(csv.DictReader((root/'dua_214_r2_manifest.tsv').open(encoding='utf-8'), delimiter='\t'))
assert len(rows)==214
values=[]
for r in rows:
    slug=r['r2_key'].split('/',1)[1].rsplit('.',1)[0]
    slug=slug.split('-',1)[1]
    url='https://audio.noorapp.in/'+r['r2_key']
    values.append("('%s','%s')"%(slug.replace("'","''"),url))
sql="""WITH target_audio(slug, audio_url) AS (\n  VALUES\n    %s\n), limited_target_audio AS (\n  SELECT slug, audio_url FROM target_audio LIMIT 214\n)\nUPDATE public.admin_content AS c\nSET audio_url = t.audio_url, updated_at = now()\nFROM limited_target_audio AS t\nWHERE c.slug = t.slug\n  AND c.status = 'published'\n  AND c.content_type IN ('dua','Dua');\n"""%',\n    '.join(values)
(root/'publish_214_dua_audio_urls.sql').write_text(sql,encoding='utf-8')
print({'rows':len(rows),'sql':str(root/'publish_214_dua_audio_urls.sql')})
