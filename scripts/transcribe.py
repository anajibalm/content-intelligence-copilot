#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.13"
# dependencies = ["faster-whisper==1.1.1", "av<19", "requests"]
# ///

import json
import os
import sys
from faster_whisper import WhisperModel

if len(sys.argv) != 2:
    raise SystemExit("usage: transcribe.py AUDIO_PATH")

model_name = os.environ.get("WHISPER_MODEL", "tiny")
model = WhisperModel(model_name, device="cpu", compute_type="int8")
segments, info = model.transcribe(sys.argv[1], vad_filter=True)
print(json.dumps({
    "engine": "faster-whisper",
    "model": model_name,
    "language": info.language,
    "segments": [
        {"startMs": round(segment.start * 1000), "endMs": round(segment.end * 1000), "text": segment.text.strip()}
        for segment in segments
        if segment.end > segment.start and segment.text.strip()
    ],
}))
