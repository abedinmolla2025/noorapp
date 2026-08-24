from pathlib import Path
import json, shutil, subprocess, sys

if len(sys.argv) != 4:
    raise SystemExit('usage: package_audio_batch.py START END BATCH_LABEL')
start, end = int(sys.argv[1]), int(sys.argv[2])
label = sys.argv[3]
root = Path('/home/ubuntu/noorapp')
rows = json.loads((root / 'public/data/duas.json').read_text())
source = root / 'audio' / 'mastered'
out = root / 'audio' / 'packages' / f'{label}_{start}_{end}'
if out.exists(): shutil.rmtree(out)
out.mkdir(parents=True)
for n in range(start, end + 1):
    title = f"{rows[n-1]['title_bn']} — ধীর ও স্পষ্ট অডিও"
    safe_title = title.replace('/', '／')
    mp3 = source / f'{safe_title}.mp3'
    if not mp3.exists(): raise FileNotFoundError(mp3)
    shutil.copy2(mp3, out / mp3.name)
with (out / 'verified_durations.txt').open('w') as f:
    for mp3 in sorted(out.glob('*.mp3')):
        p = subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(mp3)], check=True, capture_output=True, text=True)
        f.write(f'{mp3.name}\t{float(p.stdout.strip()):.2f}s\n')
zipfile = root / 'audio' / 'packages' / f'{label}_records{start}-{end}_audio.zip'
if zipfile.exists(): zipfile.unlink()
subprocess.run(['zip','-qr',str(zipfile),out.name], cwd=out.parent, check=True)
subprocess.run(['unzip','-tq',str(zipfile)], check=True)
print(f'Packaged {len(list(out.glob("*.mp3")))} MP3 files into {zipfile}')
print(f'ZIP_BYTES={zipfile.stat().st_size}')
