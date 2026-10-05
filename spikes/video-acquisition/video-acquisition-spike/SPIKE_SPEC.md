# Spike Decision Record

## Question

Can the MVP turn already-published public TikTok URLs into analyzable media without asking another agency division for files?

## Why this is the gate

Everything after MP4 is already chosen for the MVP:

MP4 -> ffprobe -> ffmpeg -> faster-whisper -> hook/representative frames -> multimodal extraction.

The only provider decision still open is URL -> media.

## Selection rule

1. Reliability on the real Barakat URL set.
2. Zero human coordination.
3. Cost per successful video.
4. Median latency.
5. Operational simplicity.
6. Provider lock-in risk.

Do not choose on advertised price alone.

## Candidate routes

### Route A — direct yt-dlp
Cheapest API-wise ($0), but only survives if the real-url success rate is acceptable.

### Route B — TikHub
Test directly or through Treg later. The contract only needs a TikHub-compatible provider adapter.

### Route C — Apify resolver
Fallback candidate that returns a direct download URL. Keep Actor ID configurable.

## Decision outcomes

- If direct route >=90% and stable on rerun: use direct primary, paid fallback.
- If direct route is brittle and TikHub >=90%: TikHub primary, Apify fallback.
- If TikHub is brittle but Apify >=90%: Apify primary.
- If no automated route reaches 90%: acquisition is a product risk; do not hide it behind manual cross-division file requests.

## Re-run test

Repeat the exact same 3 URLs later in the day or next day. We need to know whether success was durable, not a one-shot accident.
