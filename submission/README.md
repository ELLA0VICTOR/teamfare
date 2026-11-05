# Teamfare submission media

Prepared for Vultr Agent Rush · **Powering the Future of Work** · 5 November 2026.

## Upload on page 2

| Form field | File | Status |
| --- | --- | --- |
| Cover Image | `Teamfare-cover.png` | Ready · 1920×1080 PNG (16:9) |
| Slide Presentation | `Teamfare-pitch-deck.pdf` | Ready · 11 conventional landscape slides with selectable text and clickable public links |
| Video Presentation | `Teamfare-demo.mp4` | Ready · USD version · 2:10.8 · 1920×1080, 30 fps, H.264/AAC |

`Teamfare-demo.mp4` is the finished USD recording, using the user's new `team.mp3` voiceover at its original speed and pitch. It shows the $22.28 per-person budget and $8.91 sample expense. The full 415-word narration is retained, with no currency-storage or conversion explanation added to the speech. Screen actions remain at normal speed; idle waits and repeated steps are cut between scenes.

For CapCut, start `Teamfare-visuals.mp4` and `Teamfare-voiceover-original.mp3` together at 00:00; add `Teamfare-captions.srt` if wanted. These all belong to the current USD edit. The MP3 copy is byte-for-byte identical to the supplied new file. `Voiceover-final.txt`, `Voiceover.txt` and `Voiceover-USD.txt` match this narration. The previous video exports were removed from this folder and replaced. `Demo-receipt.pdf` is the clearly labelled USD demonstration attachment.

`Teamfare-pitch-deck.pptx` is the editable PowerPoint version. The deck was rebuilt using the user's virtual-lab presentation as a style reference: white backgrounds, Times New Roman, clear section headings, explanatory text and captioned application screenshots. The architecture diagram remains slide 8, with editable shapes and connections. The former separate cost figures below the review screenshot have been removed.

## Slides

1. Teamfare and the product promise.
2. The coordination problem for employees and managers.
3. The shared Plan Sheet.
4. Actual Qwen/Vultr/Tavily research.
5. Availability and coordination.
6. Separate-manager approval and budget checks.
7. Private receipts and reporting.
8. Vultr deployment and provider architecture.
9. Identity, workflow boundaries and recovery.
10. Verified checks and measured small-team results.
11. Public app, repository and judge access.

The deck uses current screenshots from the live app. Sample records and public judge accounts are identified. The source screenshot of AI results is from an actual run on 5 November: two searches, two pages read, three sourced options and a saved editable draft. No screenshot substitutes a simulated agent result. Claimed operational checks refer to the evidence recorded in `docs/DEPLOYMENT.md` and `docs/FUNCTIONALITY-AUDIT.md`; no unmeasured market/revenue or adoption figures are included.

## Edit or re-export

Open `Teamfare-pitch-deck.pptx` in PowerPoint for direct editing. For a reproducible build, `source/generate-deck.mjs` defines the writing, pictures and layout, `source/deck.json` is its generated native shape data, and `source/build-deck.ps1` builds and exports through Microsoft PowerPoint. From the repository root on Windows with Node and Microsoft PowerPoint installed:

```sh
node submission/source/render.mjs
```

This creates an editable PPTX, native PDF and 1920×1080 cover. The same PowerPoint engine exports both PDF and review images. Native text bounds are checked for overflow, page boundaries, reserved footer space and text intersections before the final files are replaced. Review PNGs and measurements are under ignored `.artifacts/submission/native-review/`. No app deployment or provider call is needed for an export. The wrapper executes only this local build source and does not change the machine's PowerShell execution policy.

The slides use the system-installed Times New Roman font, rendered by PowerPoint. No Microsoft font files are redistributed. The separate demonstration receipt retains its DM Sans font and OFL licence in `public/licenses/`. Application screenshots show this project. Other assets and project licensing are documented in `THIRD_PARTY_NOTICES.md` and `LICENSE`. The reference PowerPoint was inspected read-only and was not modified or copied into this repository.

The replacement video uses recordings from the actual application, with visible cursor movement, typing, scrolling and real workflow actions. The original voiceover has no speed, pitch, volume or sentence edits. Its MP4 audio is encoded as AAC for compatibility. The real research wait is shortened and labelled. No fake agent results or app responses are inserted. The rejected slowed voiceover export was removed. Private browser sessions and raw footage stay under ignored `.artifacts/video/`. Nothing has been uploaded or submitted automatically. The cover and pitch deck remain available.
