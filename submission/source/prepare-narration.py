"""Copy the supplied MP3 without altering its audio; prepare timing and captions."""
import argparse, hashlib, json, re, shutil, wave
from pathlib import Path

parser=argparse.ArgumentParser()
parser.add_argument('--audio',required=True,type=Path)
args=parser.parse_args()
work=Path('.artifacts/video/audio')
alignment=json.loads((work/'alignment.json').read_text())
script=Path('submission/Voiceover.txt').read_text(encoding='utf8')
aligned_script='\n\n'.join(p['text'] for p in alignment['paragraphs'])
if script.split()!=aligned_script.split():
 raise RuntimeError('The script changed. Align the new original voiceover before rebuilding; do not use the previous currency version.')
with wave.open(str(work/'voiceover.wav')) as w: duration=w.getnframes()/w.getframerate()
voice=Path('submission/Teamfare-voiceover-original.mp3')
shutil.copyfile(args.audio,voice)
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
if digest(args.audio)!=digest(voice):raise RuntimeError('Original audio copy mismatch')
ps=alignment['paragraphs']
bounds=[0]+[(a['end']+b['start'])/2 for a,b in zip(ps,ps[1:])]+[duration]
paragraphs=[{**p,'segmentStart':bounds[i],'segmentEnd':bounds[i+1]} for i,p in enumerate(ps)]
result={'audioMode':'original-unmodified','audioPlaybackSpeed':1,'duration':duration,'originalSha256':digest(voice),
        'voiceFile':str(voice),'paragraphs':paragraphs,'words':alignment['words']}
(work/'original-alignment.json').write_text(json.dumps(result,indent=2))
Path('submission/Voiceover-final.txt').write_text(Path('submission/Voiceover.txt').read_text(encoding='utf8'),encoding='utf8')
def ts(t):
 ms=round(max(0,t)*1000);h,ms=divmod(ms,3600000);m,ms=divmod(ms,60000);s,ms=divmod(ms,1000)
 return f'{h:02}:{m:02}:{s:02},{ms:03}'
groups=[];group=[]
for word in alignment['words']:
 group.append(word)
 if len(' '.join(w['text'] for w in group))>=58 or (len(group)>=5 and re.search(r'[.!?]$',word['text'])):
  groups.append(group);group=[]
if group:groups.append(group)
captions=[]
for i,g in enumerate(groups):
 text=' '.join(w['text'] for w in g)
 if len(text)>46:
  cut=min((j for j,c in enumerate(text) if c==' '),key=lambda j:abs(j-len(text)/2))
  text=text[:cut]+'\n'+text[cut+1:]
 end=min(duration,max(g[0]['start']+.4,g[-1]['end']))
 if i+1<len(groups):end=min(end,groups[i+1][0]['start']-.025)
 captions.append(f'{i+1}\n{ts(g[0]["start"])} --> {ts(end)}\n{text}\n')
Path('submission/Teamfare-captions.srt').write_text('\n'.join(captions),encoding='utf8')
print(json.dumps({'originalAudioCopiedUnchanged':True,'seconds':duration,'audioPlaybackSpeed':1,'captions':len(groups)}))
