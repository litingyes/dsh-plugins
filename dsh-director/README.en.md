# @litingyes/dsh-director

AI video direction for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): turn "I want to make a video" into a shootable storyboard, **paste-ready prompts**, and an audio-visual plan.

The plugin **does not generate video, call any generation API, or upload assets**. What it produces is the three things a generation platform asks for — **positive prompt, negative prompt, parameters** — plus the story structure, shot list and sound design that make those prompts work.

It is not a prompt vending machine. The method that a first-time director is missing — how to organize plot, how to break a scene into shots, how to marry sound and picture — is an embedded skill (`ai-video-direction`), and every decision lands in the workspace's `video/` files so a new Session can continue the production.

## Four parts

1. **Six agent tools** — project, storyboard, takes, audio, prompts, review.
2. **The `ai-video-direction` skill** — story skeletons, shot design, framing/movement vocabulary, prompt recipes, platform notes, sound design, common failures and fixes.
3. **An always-on guidance section** — so "make me an AI video" reaches the tools and the skill instead of producing a loose paragraph of prompt text.
4. **A right-sidebar "Director" tab** — storyboard, prompt copying, a Markdown download and the review. The board is **read-only**; every change goes through the conversation's tools, so there is no second write path that can overwrite the agent's edits.

## Tools

| Tool | What it does | Main arguments |
| --- | --- | --- |
| `video_project` | Read, create or update the production brief (platform, aspect, target duration, products, characters, style) | `action` (init/read/update), `title`, `logline`, `aspect`, `target_duration_sec`, `products`, `characters`, `style` |
| `video_storyboard` | Add, update, reorder and remove scenes and shots | `action`, `scene`, `shot`, `patch`, `scene_id`, `shot_id`, `position`, `force` |
| `video_take` | Log generated clips, rate them, mark the selected take | `action` (list/add/select/update/remove), `shot_id`, `take`, `take_id` |
| `video_audio` | Plan voice-over, music and sound effects | `action`, `track`, `patch`, `track_id` |
| `video_prompt` | Assemble the paste-ready prompt for a shot, a scene or the film, with positive/negative/params kept apart | `scope`, `shot_id`, `scene_id`, `language` |
| `video_review` | Deterministic review: missing prompts or actions, duration drift, takes without a selection, dialogue without voice-over, negative text inside the positive prompt, referenced files that do not exist | `scene_id`, `include_info` |

Refusals carry a stable code (`VIDEO_PROJECT_MISSING`, `VIDEO_PATH_ESCAPE`, `VIDEO_STALE`, …) and an actionable message; content gaps are reported by `video_review` instead of failing a call.

## One complete pass

1. "I want a 40-second suspense short for Kling."
2. The agent loads `ai-video-direction`, asks the three structural questions first (audience, platform, one-sentence story) and fills in style and product after.
3. `video_project init` creates `video/`; `video_storyboard` lays out scenes and shots with action, framing, movement and duration.
4. `video_storyboard update_shot` writes the prompt: `prompt.text` (positive), `prompt.negative` (negative), `prompt.params` (duration/aspect/first frame/references).
5. Copy each field from **Director → Prompts**, or ask for `video_prompt scope=all`; paste into Kling.
6. Put generated files under `video/assets/takes/<shot id>/`, tell the agent which one is better; `video_take add` records it and `select` marks it.
7. `video_audio` adds voice-over, music and effects with timings and targets.
8. `video_review` reaches zero errors; download the `.md` prompt sheet from the Prompts tab for the editor.
9. In a new Session, "let's continue the night-shift short" — the agent reads `video/` and picks up.

## Files

Default root `video/` (configurable):

```
video/
├── project.json      # brief, characters, style, products
├── storyboard.json   # scenes → shots → takes
├── audio.json        # vo / music / sfx
└── assets/
    ├── ref/          # reference and character images
    ├── takes/        # generated clips, one directory per shot
    └── audio/        # voice-over, music, effects
```

`project.json` (excerpt):

```json
{
  "schemaVersion": 1,
  "title": "Night Shift",
  "logline": "A night guard finds another version of himself on the monitors.",
  "aspect": "9:16",
  "targetDurationSec": 40,
  "products": ["Kling"],
  "characters": [{ "id": "guard", "name": "Zhou", "look": "40, buzz cut, navy uniform" }]
}
```

One shot in `storyboard.json` (excerpt):

```json
{
  "id": "S1-01",
  "durationSec": 4,
  "shotSize": "medium",
  "movement": "slow push-in",
  "action": "stares at the screen, leaning forward",
  "prompt": {
    "text": "3 a.m. security room, a 40-year-old guard sits at the console, cold monitor light on his face, slow push-in, cold blue, realistic film look",
    "negative": "text watermark, deformed hands, extra people",
    "product": "Kling",
    "params": { "duration": "5s", "aspect": "9:16", "references": ["assets/ref/guard.png"] }
  },
  "status": "prompt_ready",
  "takes": []
}
```

Rules:

- Ids: scene `S1`, shot `S1-01`, take `t1` inside a shot, audio track `A1`. Generated on creation and stable afterwards.
- Status: `planned → prompt_ready → generating → generated → selected`, plus `dropped`. Adding a take moves a planned/prompt-ready shot to `generated`; selecting one moves it to `selected`.
- Paths: take and reference paths are project-relative (`assets/...`); absolute paths and `..` are refused.
- Hand-editing is allowed, but `schemaVersion` must be `1`; tools and the board validate the files and name the one that failed to parse.

## The Director tab

Open the right sidebar's "+" and choose **AI video director**. The tab follows the Session's working directory.

- **Storyboard** — collapsible scenes; each shot card shows id, duration, status, framing/movement, action, takes and the selected take, plus prompt readiness. The card's copy button copies the positive prompt.
- **Prompts** — the core tab. Every shot splits positive, negative and parameters into three blocks with their own copy buttons; copy a scene, copy the film, or download `.md`. The output is byte-identical to `video_prompt`.
- **Audio** — voice-over, music and effects grouped by kind, with timings and targets.
- **Review** — the same findings as `video_review`, grouped by severity; open one for the exact location and fix.

The board is read-only on purpose: mutations run through the version-guarded tools, so a refresh is the only way it picks up a change. It refreshes on window focus and visibility change, and the header has a refresh button.

## Install

From npm:

```text
plugin_manager action=install_bundle target=@litingyes/dsh-director@0.1.0
```

From a local checkout:

```text
plugin_manager action=install_bundle target=/absolute/path/to/dsh-plugins/dsh-director
```

The Plugins page also accepts a local path, a tarball or a Git URL. After installing:

- The Host half (tools, skill, review, API) is loaded at startup — **restart DSH**.
- The browser half (the sidebar tab) loads with the page; the desktop app needs a restart or a plugin off/on after an upgrade.

## Configuration

The row's `config` in `cordis.patch.yml`. Every field is validated at mount; an invalid value fails the row instead of degrading silently.

| Field | Default | Meaning |
| --- | --- | --- |
| `root` | `video` | Project directory relative to the Session cwd; no absolute path, no `..` |
| `guidance` | `true` | Register the always-on prompt section |
| `skill` | `true` | Register the embedded skill |
| `defaultAspect` | `9:16` | Aspect seeded into a new project (`16:9` / `9:16` / `1:1` / `4:5` / `4:3` / `3:4` / `21:9`) |
| `maxScenes` | `40` | Scene cap |
| `maxShotsPerScene` | `60` | Shots-per-scene cap |
| `maxTakesPerShot` | `20` | Takes-per-shot cap |
| `maxPromptChars` | `2000` | Characters per prompt |
| `minShotSeconds` | `1` | Shortest shot |
| `maxShotSeconds` | `10` | Longest shot (must exceed the shortest) |
| `durationTolerance` | `0.15` | Allowed drift between the planned total and the target (0–1) |

Overriding the row replaces `config` wholesale; restate every field you still want.

## Limits

- **No video generation**, no Kling/Jimeng/Hailuo API calls, no asset upload or download.
- The board is read-only; writes only go through tools, which use the version they read. A conflict returns `VIDEO_STALE` and asks for a re-read.
- No ffprobe, transcoding, playback or thumbnails; the review only `stat`s referenced take files.
- The skill body is Chinese; the UI is bilingual; tool descriptions and results are English (matching DSH's built-in tools).
- The always-on guidance only raises the chance the skill is loaded; it is not a guarantee.
- Platform capabilities (duration limits, first/last frame, references, camera controls) are taken from the user's UI, never hard-coded; the agent asks when unsure.

## Development

```bash
cd dsh-director
npm install        # esbuild only
npm run build      # rebuild client.js (commit it)
npm test           # node --test
npm run check      # bundle freshness + syntax
```

The browser half may externalize only `react` / `react-dom` / `react/jsx-runtime`; everything else is bundled, and the build script asserts it.

## Uninstall

```text
plugin_manager action=remove_bundle target=@litingyes/dsh-director
```

The `video/` production files are yours to keep.

## License

[MIT](./LICENSE)
