# Finished USD video

Upload `Teamfare-demo.mp4`. Its verified duration is **2:10.8**, below the three-minute limit, at 1920×1080 and 30 fps.

The new `team.mp3` narration plays in full at its original speed and pitch. No audio speed, pitch, volume or sentence changes are applied. AAC encoding is used in the MP4 for compatibility. The previous video and silent export have been replaced with this USD recording.

For optional CapCut changes, start these together at 00:00:

- `Teamfare-visuals.mp4`: the current USD screen edit without audio.
- `Teamfare-voiceover-original.mp3`: a byte-for-byte copy of the new supplied MP3.
- `Teamfare-captions.srt`: optional captions aligned to this recording.

The script files `Voiceover.txt`, `Voiceover-USD.txt` and `Voiceover-final.txt` contain the current narration. It mentions dollars only, with $22.28 per person and an $8.91 sample expense. No explanation about currency storage or conversion is spoken.

Fresh footage shows real research, choosing a plan, availability replies, approval from a separate manager, attendance, calendar download, the sample expense/receipt and USD CSV export. Retained mouse movement, typing and scrolling play at normal speed. Repeated entries and idle waits are omitted between cuts. The actual research wait is shortened and labelled.

The sample receipt is demonstration data. Public judge accounts cannot send external email; the narration and on-screen label distinguish private-team email features. Bookings and payments remain external. No agent result, approval, expense or download is fabricated.

Play the finished video once before uploading. Nothing has been uploaded or submitted automatically.

## Rebuild

`source/prepare-narration.py` copies the supplied MP3 and prepares captions/timing without processing its audio. `source/edit-video.py` uses the current USD captures and verifies the audio hash before muxing. Private alignment, raw clips and authenticated sessions remain under ignored `.artifacts/video/`.

```sh
python submission/source/prepare-narration.py --audio "PATH_TO_TEAM_MP3"
python submission/source/edit-video.py --audio submission/Teamfare-voiceover-original.mp3
```
