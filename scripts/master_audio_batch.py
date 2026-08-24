from pathlib import Path
import subprocess, json

root=Path('/home/ubuntu/noorapp')
outdir=root/'audio'/'mastered'
outdir.mkdir(parents=True, exist_ok=True)
rows=json.loads((root/'public/data/duas.json').read_text())
indices=range(4,14)  # records 5-14; record 1 was intentionally skipped
for idx in indices:
    r=rows[idx]
    n=idx+1
    src=root/'audio'/f'batch01-{n:02d}-balanced-ar.wav'
    title=f"{r['title_bn']} — ধীর ও স্পষ্ট অডিও"
    safe=title
    wav=outdir/f'{safe}.wav'
    mp3=outdir/f'{safe}.mp3'
    filt='aresample=48000:resampler=soxr,highpass=f=80,lowpass=f=11500,afftdn=nr=6:nf=-46,equalizer=f=180:t=q:w=1.0:g=0.8,equalizer=f=420:t=q:w=1.0:g=-1.2,equalizer=f=2800:t=q:w=0.85:g=1.4,equalizer=f=4800:t=q:w=0.9:g=1.1,deesser=i=0.12:m=0.3:f=0.68,acompressor=threshold=-20dB:ratio=1.8:attack=12:release=100:makeup=1.0,loudnorm=I=-16:TP=-1.5:LRA=7,alimiter=limit=0.93:attack=5:release=45'
    subprocess.run(['ffmpeg','-y','-i',str(src),'-af',filt,'-c:a','pcm_s24le','-ar','48000','-metadata',f'title={title}','-metadata','artist=Noor Islamic App','-metadata','language=Arabic',str(wav)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    subprocess.run(['ffmpeg','-y','-i',str(wav),'-c:a','libmp3lame','-b:a','256k','-ar','48000','-id3v2_version','3','-metadata',f'title={title}','-metadata','artist=Noor Islamic App','-metadata','language=Arabic',str(mp3)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    print(n,title)
