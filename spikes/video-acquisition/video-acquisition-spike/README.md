# Video Acquisition Spike — Content Intelligence MVP

## Goal

Prove the only acquisition assumption that is still open:

**public TikTok URL -> downloadable media -> ffmpeg/ffprobe -> evidence packet**

No cross-division MP4 handoff is used in the happy path.

## Real test corpus

`barakat_batch8_urls.csv` contains 12 published URLs extracted from the Barakat Batch 8 report.
For the hackathon gate, run the first 10; rows 11–12 are useful extra validation.

## Acquisition routes

`--route auto` tries:

1. `yt-dlp` if installed — zero API cost, but treat reliability as an empirical question.
2. TikHub direct API if `TIKHUB_API_KEY` exists.
3. Apify resolver if `APIFY_TOKEN` exists.

Provider choice is NOT frozen until the real URLs are run.

### TikHub

Environment:

```bash
export TIKHUB_API_KEY="..."
```

The spike uses the documented TikTok web post-detail endpoint with the numeric item ID and region `ID`.

### Apify

Environment:

```bash
export APIFY_TOKEN="..."
# optional override
export APIFY_ACTOR="spider_studio~tiktok-video-resolver"
```

The default Actor input is `{"urls":[...]}` and the spike reads `downloadUrl`.

## Local dependencies

Required:

```bash
ffmpeg
ffprobe
python >= 3.9
```

Optional zero-cost direct route:

```bash
pip install yt-dlp
```

Optional transcription:

```bash
pip install faster-whisper
```

If `faster-whisper` is absent, acquisition/ffmpeg still runs and transcription is marked `skipped`.

## Run

```bash
cd video-acquisition-spike

python spike_acquisition.py \
  --input barakat_batch8_urls.csv \
  --limit 10 \
  --route auto
```

Keep temporary MP4 for debugging only:

```bash
KEEP_MP4=1 python spike_acquisition.py --limit 3
```

Default behavior deletes the MP4 after derivative evidence is created.

## PASS gate

Technical gate:

- >= 9/10 normal public URLs acquired and processed
- 0 human handoffs
- MP4 decodes via ffprobe
- audio extraction succeeds
- first-3-second frames exist
- representative frames exist

Record:

- provider used
- failure reason
- latency/video
- media size
- duration
- retry behavior

A provider is selected by **observed success rate first**, then total acquisition cost/latency.

## Quality gate after acquisition

Technical PASS alone is not enough.

For a minimum of 3 difficult videos, manually verify:

- transcript preserves key meaning / brand words
- timestamps are approximately correct
- on-screen hook text is readable from the 0s / 1.5s / 3s frames
- representative frames cover the main execution

For the initial 10-video golden set:

1. Analyst labels fingerprint fields blind.
2. Run AI extraction.
3. Compare per field: exact/acceptable, incorrect, uncertain.
4. Run extraction twice on identical evidence to measure categorical stability.

## Important contract boundaries

- TikTok permalink + external ID are canonical.
- Resolved CDN URL is transient.
- Provider raw response is persisted separately.
- Provider response never becomes the domain model directly.
- Public MP4 is temporary.
- Transcript/frames/metadata are durable analytical artifacts.
