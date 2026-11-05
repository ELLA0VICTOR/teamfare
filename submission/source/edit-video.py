"""Build the narrated demo from genuine Playwright video captures.

Run from the repository root: python submission/source/edit-video.py --audio PATH
Capture/session files stay in ignored .artifacts/video; only final media is public.
Requires Pillow and FFmpeg (imageio-ffmpeg is an optional locator).
"""
import argparse
import json
import subprocess
import hashlib
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path.cwd()
WORK = ROOT / '.artifacts/video'
OUT = ROOT / 'submission'
ENC = WORK / 'usd/encoded-original'
ENC.mkdir(exist_ok=True, parents=True)
parser = argparse.ArgumentParser()
parser.add_argument('--audio', required=True, type=Path)
parser.add_argument('--part', choices=['early', 'all'], default='all')
parser.add_argument('--refresh', help='Re-encode only this scene; reuse the other existing encoded clips.')
args = parser.parse_args()
FF = (WORK / 'ffmpeg-path.txt').read_text().strip()
manifest = json.loads((WORK / 'usd/capture.json').read_text())
scenes = {s['id']: s for s in manifest['scenes']}
speech = json.loads((WORK / 'audio/original-alignment.json').read_text())
if hashlib.sha256(args.audio.read_bytes()).hexdigest() != speech['originalSha256']:
    raise ValueError('Use the unchanged original MP3 supplied by the user.')
FPS = 30


def run(arguments):
    result = subprocess.run([FF, '-hide_banner', '-loglevel', 'error', '-y', *arguments],
                            capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr[-5000:])


def font(size, bold=False):
    return ImageFont.truetype('C:/Windows/Fonts/' + ('segoeuib.ttf' if bold else 'segoeui.ttf'), size)


def centered(draw, y, text, size, color='#17251e', bold=False):
    f = font(size, bold)
    box = draw.textbbox((0, 0), text, font=f)
    draw.text(((1920 - box[2]) / 2, y), text, fill=color, font=f)


endcard = WORK / 'review/endcard.png'
im = Image.new('RGB', (1920, 1080), '#f7f3ea')
d = ImageDraw.Draw(im)
d.line((280, 230, 1640, 230), fill='#bfc5ba', width=2)
centered(d, 300, 'Teamfare', 112, bold=True)
centered(d, 475, 'Bring your team together.', 52)
centered(d, 552, 'Leave the admin to us.', 52, '#4a524b')
centered(d, 735, 'teamfare.dixmail.xyz', 37, '#1f4d3a', True)
centered(d, 873, 'Vultr Agent Rush  ·  Powering the Future of Work', 26, '#4a524b')
im.save(endcard)

# Editor annotations identify the acting account; they do not alter app state.
for role, label in [('employee', 'Organiser'), ('manager', 'Manager')]:
    overlay = Image.new('RGBA', (1440, 810))
    draw = ImageDraw.Draw(overlay)
    draw.rectangle((8, 770, 111, 801), fill='#ffffff', outline='#c7cec5')
    draw.text((16, 775), label, font=font(17, True), fill='#1f4d3a')
    overlay.save(WORK / f'review/label-{role}.png')

notice = Image.new('RGBA', (1440, 810))
nd = ImageDraw.Draw(notice)
nd.rectangle((120, 759, 765, 800), fill='#ffffff', outline='#c7cec5')
nd.text((134, 768), 'Public judge accounts: outbound email is disabled.', font=font(16), fill='#334539')
notice.save(WORK / 'review/email-note.png')


def video_clip(name, seconds):
    s = scenes[name]
    if not s['success'] or s['end'] <= s['start']:
        raise RuntimeError(f'Cannot use failed capture {name}')
    target = ENC / f'{name}.mp4'
    if args.refresh and args.refresh != name and target.exists():
        return target, round(seconds * FPS)
    inputs = ['-i', str(ROOT / s['file']), '-i', str(WORK / f"review/label-{s['role']}.png")]
    spans = [(s['start'], s['end'])]
    # Keep the original narration unchanged. Edit out repeated form entries,
    # note-field toggling and idle waits; never change screen playback speed.
    relative = {
        '01-home': [(0,8),(18.7,18.7+seconds-8)],
        '02-brief': [(0,3.8),(7.9,10),(10,12),(13.591,15.681)],
        '03-progress': [(0,seconds)],
        '03-options': [(3,9.4),(11.8,15.325)],
        '04-plan': [(0,4),(5.3,7.5),(9.8,9.8+seconds-6.2)],
        '05a-propose': [(1.95,5.3)],
        '05b-reply': [(0,4.1)],
        '05c-time': [(1.5,1.5+seconds)],
        '06a-submit': [(0,3)],
        '06b-review': [(0,seconds-2.937),(10.5,13.437)],
        '07-rsvp': [(0,2.3),(4.1,8.5),(10.9,10.9+seconds-6.7)],
        '08-expense': [(0,2.8),(5.2,9),(10.5,12.3),(13.9,15.735)],
        '09-report': [(0,1.7),(2.7,4.4),(5.1,6.8),(8.4,10.6),(11.8,11.8+seconds-7.3)],
        '11-close': [(0,seconds)],
    }.get(name)
    if relative:
        spans=[(s['start']+a,min(s['end'],s['start']+b)) for a,b in relative]
    usable = sum(end - start for start, end in spans)
    if usable > seconds + .4:
        raise RuntimeError(f'{name} overruns its voice section by {usable-seconds:.2f}s; retake instead of speeding up.')
    filters = []
    if len(spans) == 1:
        filters.append(f'[0:v]trim=start={spans[0][0]}:end={spans[0][1]},setpts=PTS-STARTPTS[base]')
    else:
        for i, (start, end) in enumerate(spans):
            filters.append(f'[0:v]trim=start={start}:end={end},setpts=PTS-STARTPTS[p{i}]')
        filters.append(''.join(f'[p{i}]' for i in range(len(spans))) + f'concat=n={len(spans)}:v=1:a=0[base]')
    filters.append(f'[base]fps={FPS},tpad=stop_mode=clone:stop_duration={max(2,seconds-usable+.1)},trim=duration={seconds}[timed]')
    filters.append('[timed][1:v]overlay=0:0:format=auto[actor]')
    final = 'actor'
    if name in ['03-progress', '03-options']:
        inputs += ['-i', str(WORK / 'review/label-research.png')]
        enabled = ":enable='lt(t,2)'" if name == '03-options' else ''
        filters.append('[actor][2:v]overlay=0:0:format=auto'+enabled+'[notice]')
        final = 'notice'
    if name == '07-rsvp':
        inputs += ['-i', str(WORK / 'review/email-note.png')]
        filters.append(f"[actor][2:v]overlay=0:0:format=auto:enable='gte(t,{seconds-4})'[notice]")
        final='notice'
    filters.append(f'[{final}]scale=1920:1080:flags=lanczos,setsar=1,format=yuv420p[out]')
    frames = round(seconds * FPS)
    run([*inputs, '-filter_complex', ';'.join(filters), '-map', '[out]', '-an',
         '-frames:v', str(frames), '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
         '-threads', '4', '-movflags', '+faststart', str(target)])
    print(json.dumps({'encoded': name, 'frames': frames, 'seconds': frames/FPS}), flush=True)
    return target, frames


def still_clip(name, path, seconds, architecture=False):
    target = ENC / f'{name}.mp4'
    if args.refresh and args.refresh != name and target.exists():
        return target, round(seconds * FPS)
    vf = 'scale=1920:1080,setsar=1,format=yuv420p'
    if architecture:
        # Follow the three Vultr services as they are named in the narration.
        for x,y,w,h,start,end in [(567,360,588,322,0,4.3),(1335,254,532,184,4.3,8.5),(1335,453,532,151,8.5,10.5),(1335,783,532,129,10.5,seconds-.3)]:
            vf += f",drawbox=x={x}:y={y}:w={w}:h={h}:color=0x2b8055:t=5:enable='between(t,{start},{end})'"
    frames = round(seconds * FPS)
    run(['-loop', '1', '-framerate', str(FPS), '-i', str(path), '-vf', vf,
         '-frames:v', str(frames), '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
         '-threads', '4', '-movflags', '+faststart', str(target)])
    print(json.dumps({'encoded': name, 'frames': frames}), flush=True)
    return target, frames


paragraph = lambda n: speech['paragraphs'][n-1]
length = lambda n: paragraph(n)['segmentEnd'] - paragraph(n)['segmentStart']
timeline = [('01-home',paragraph(5)['segmentStart']),('02-brief',length(5)),
            ('03-progress',3.7),('03-options',length(6)-3.7),('04-plan',length(7)),
            ('05a-propose',3.35),('05b-reply',4.1),('05c-time',length(8)-7.45),
            ('06a-submit',3.0),('06b-review',length(9)-3.0),('07-rsvp',length(10)),
            ('08-expense',length(11)),('09-report',length(12)),('10-architecture',length(13)),
            ('11-close',length(14)),('12-endcard',length(15)+.6)]
clips, details, frame = [], [], 0
for name, seconds in timeline:
    if args.part == 'early' and name > '04-plan':
        break
    if name == '10-architecture':
        clip, count = still_clip(name, ROOT / '.artifacts/submission/native-review/slide-08.png', seconds, True)
    elif name == '12-endcard':
        clip, count = still_clip(name, endcard, seconds)
    else:
        clip, count = video_clip(name, seconds)
    clips.append(clip)
    details.append({'scene':name,'start':frame/FPS,'end':(frame+count)/FPS,'frames':count,'playbackSpeed':1})
    frame += count
if args.part == 'early':
    raise SystemExit('Early scenes encoded; no final file produced.')
if frame/FPS > 179.5:
    raise RuntimeError('The final edit must remain safely below three minutes.')

listing = ENC / 'concat.txt'
listing.write_text(''.join("file '" + p.name + "'\n" for p in clips))
visuals = OUT / 'Teamfare-visuals.mp4'
run(['-f', 'concat', '-safe', '0', '-i', str(listing), '-map', '0:v:0', '-c:v', 'copy',
     '-an', '-movflags', '+faststart', str(visuals)])
final = OUT / 'Teamfare-demo.mp4'
run(['-i', str(visuals), '-i', str(args.audio.resolve()), '-map', '0:v:0', '-map', '1:a:0',
     '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
     '-t', str(frame/FPS), '-movflags', '+faststart',
     '-metadata', 'title=Teamfare — from the first idea to the final receipt', str(final)])
(WORK / 'edit-timeline.json').write_text(json.dumps({'fps':FPS,'duration':frame/FPS,'audioPlaybackSpeed':1,'originalAudioSha256':speech['originalSha256'],'clips':details}, indent=2))
print(json.dumps({'final':str(final),'silent':str(visuals),'duration':frame/FPS,'bytes':final.stat().st_size}), flush=True)
