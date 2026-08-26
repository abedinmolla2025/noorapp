import json
from pathlib import Path
stories = json.loads(Path('/home/ubuntu/noorapp/public/stories.json').read_text())
for s in stories:
    print(f"{s.get('slug','')}\t{s.get('title_bn','')}\t{s.get('title_en','')}")
