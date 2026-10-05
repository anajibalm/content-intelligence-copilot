#!/usr/bin/env python3
"""
URL -> MP4 acquisition spike for the Content Intelligence MVP.

Routes:
  1) yt-dlp direct (optional, zero API cost; used when installed)
  2) TikHub direct API (TIKHUB_API_KEY)
  3) Apify TikTok Video Resolver (APIFY_TOKEN)

The script records acquisition + ffprobe + ffmpeg evidence extraction.
It does not require the application/database to exist.

Examples:
  python spike_acquisition.py --input barakat_batch8_urls.csv --limit 10 --route auto
  TIKHUB_API_KEY=... python spike_acquisition.py --route tikhub
  APIFY_TOKEN=... python spike_acquisition.py --route apify

Optional:
  pip install yt-dlp
  pip install faster-whisper
"""

import argparse, csv, json, os, re, shutil, subprocess, sys, tempfile, time
from pathlib import Path
from urllib import request, parse, error

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36"

def now_ms():
    return int(time.time() * 1000)

def video_id(url):
    m = re.search(r"/video/(\d+)", url)
    if m:
        return m.group(1)
    if url.strip().isdigit():
        return url.strip()
    raise ValueError(f"Cannot extract TikTok video id from: {url}")

def http_json(url, headers=None, method="GET", body=None, timeout=60):
    h = {"User-Agent": UA}
    if headers:
        h.update(headers)
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        h["Content-Type"] = "application/json"
    req = request.Request(url, data=data, headers=h, method=method)
    with request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))

def download(url, target, timeout=120):
    req = request.Request(url, headers={"User-Agent": UA})
    with request.urlopen(req, timeout=timeout) as r, open(target, "wb") as f:
        shutil.copyfileobj(r, f)
    return os.path.getsize(target)

def walk_candidates(obj, found=None):
    """Find plausible direct MP4/play/download URLs recursively."""
    if found is None:
        found = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            lk = str(k).lower()
            if isinstance(v, str) and v.startswith("http"):
                score = 0
                if "download" in lk: score += 5
                if "playaddr" in lk or "play_addr" in lk: score += 4
                if "video" in lk: score += 2
                if ".mp4" in v.lower(): score += 3
                found.append((score, k, v))
            else:
                walk_candidates(v, found)
    elif isinstance(obj, list):
        for v in obj:
            walk_candidates(v, found)
    return found

def acquire_ytdlp(url, work):
    exe = shutil.which("yt-dlp")
    if not exe:
        raise RuntimeError("yt-dlp not installed")
    out = str(work / "%(id)s.%(ext)s")
    p = subprocess.run(
        [exe, "--no-playlist", "--no-warnings", "--print-json",
         "-o", out, url],
        capture_output=True, text=True, timeout=180
    )
    if p.returncode != 0:
        raise RuntimeError(p.stderr.strip()[-1000:] or "yt-dlp failed")
    info = json.loads(p.stdout.strip().splitlines()[-1])
    vid = str(info.get("id") or video_id(url))
    # yt-dlp may choose mp4/webm; locate output.
    files = sorted(work.glob(f"{vid}.*"), key=lambda x: x.stat().st_mtime, reverse=True)
    files = [x for x in files if x.suffix.lower() in {".mp4",".webm",".mkv",".mov"}]
    if not files:
        raise RuntimeError("yt-dlp succeeded but output media not found")
    return files[0], {"route":"yt-dlp","raw":info}

def acquire_tikhub(url, work):
    key = os.getenv("TIKHUB_API_KEY")
    if not key:
        raise RuntimeError("TIKHUB_API_KEY missing")
    vid = video_id(url)
    qs = parse.urlencode({"itemId": vid, "region": "ID"})
    endpoint = "https://api.tikhub.io/api/v1/tiktok/web/fetch_post_detail?" + qs
    payload = http_json(endpoint, headers={"Authorization": f"Bearer {key}"})
    candidates = sorted(walk_candidates(payload), reverse=True)
    if not candidates:
        raise RuntimeError("TikHub response had no candidate media URL")
    last = None
    for score, keyname, media_url in candidates:
        try:
            target = work / f"{vid}.mp4"
            size = download(media_url, target)
            if size > 100_000:
                return target, {
                    "route":"tikhub",
                    "chosen_key": keyname,
                    "chosen_url": media_url,
                    "raw": payload
                }
        except Exception as e:
            last = e
    raise RuntimeError(f"TikHub media candidates failed: {last}")

def acquire_apify(url, work):
    token = os.getenv("APIFY_TOKEN")
    if not token:
        raise RuntimeError("APIFY_TOKEN missing")
    # Actor input documented as {"urls":[...]}.
    actor = os.getenv("APIFY_ACTOR", "spider_studio~tiktok-video-resolver")
    endpoint = (
        f"https://api.apify.com/v2/acts/{actor}/run-sync-get-dataset-items"
        f"?token={parse.quote(token)}"
    )
    payload = http_json(endpoint, method="POST", body={"urls":[url]}, timeout=180)
    rows = payload if isinstance(payload, list) else [payload]
    if not rows:
        raise RuntimeError("Apify returned no rows")
    row = rows[0]
    if row.get("success") is False:
        raise RuntimeError("Apify resolver reported failure: " + str(row.get("error")))
    media_url = (
        row.get("downloadUrl")
        or row.get("videoMeta", {}).get("downloadUrl")
        or row.get("playUrl")
    )
    if not media_url:
        cands = sorted(walk_candidates(row), reverse=True)
        if cands:
            media_url = cands[0][2]
    if not media_url:
        raise RuntimeError("Apify row had no download URL")
    vid = str(row.get("videoId") or video_id(url))
    target = work / f"{vid}.mp4"
    download(media_url, target)
    return target, {"route":"apify","chosen_url":media_url,"raw":row}

def ffprobe(path):
    p = subprocess.run(
        ["ffprobe","-v","error","-show_entries",
         "format=duration,size:stream=codec_type,width,height",
         "-of","json",str(path)],
        capture_output=True,text=True,timeout=30
    )
    if p.returncode != 0:
        raise RuntimeError(p.stderr.strip())
    return json.loads(p.stdout)

def duration_seconds(probe):
    try:
        return float(probe["format"]["duration"])
    except Exception:
        return None

def extract_evidence(path, outdir, duration):
    outdir.mkdir(parents=True, exist_ok=True)
    # WAV for transcription
    audio = outdir / "audio.wav"
    subprocess.run([
        "ffmpeg","-y","-v","error","-i",str(path),
        "-vn","-ac","1","-ar","16000",str(audio)
    ], check=True, timeout=120)

    # Hook: 0, 1.5, 3 sec; representative: 25, 50, 75%, last-0.2s
    points = [0.0, 1.5, 3.0]
    if duration:
        points += [duration*0.25, duration*0.50, duration*0.75, max(0,duration-0.2)]
    points = sorted(set(round(max(0,x),3) for x in points if duration is None or x < duration))
    frames = []
    for i, sec in enumerate(points):
        frame = outdir / f"frame_{i:02d}_{sec:.3f}s.jpg"
        p = subprocess.run([
            "ffmpeg","-y","-v","error","-ss",str(sec),"-i",str(path),
            "-frames:v","1","-q:v","2",str(frame)
        ], capture_output=True,text=True,timeout=60)
        if p.returncode == 0 and frame.exists():
            frames.append({"timestamp_s":sec,"path":str(frame)})
    return {"audio_path":str(audio), "frames":frames}

def transcribe_optional(audio_path):
    try:
        from faster_whisper import WhisperModel
    except Exception:
        return {"status":"skipped","reason":"faster-whisper not installed"}
    model_name = os.getenv("WHISPER_MODEL","small")
    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    segs, info = model.transcribe(audio_path, language="id", vad_filter=True)
    out = []
    for s in segs:
        out.append({"start":s.start,"end":s.end,"text":s.text.strip()})
    return {"status":"completed","language":getattr(info,"language",None),"segments":out}

def choose_routes(route):
    if route == "auto":
        # Zero-API-cost route first if available; then paid/service routes if credentials exist.
        return ["yt-dlp","tikhub","apify"]
    return [route]

def run_one(item, root, route):
    start = time.time()
    out = {
        "n": item.get("n"), "concept": item.get("concept"), "url": item["url"],
        "status":"failed", "attempts":[]
    }
    work = root / f"{int(item.get('n') or 0):02d}_{video_id(item['url'])}"
    work.mkdir(parents=True, exist_ok=True)
    media = None
    acquisition = None

    for r in choose_routes(route):
        t0 = time.time()
        try:
            if r == "yt-dlp":
                media, acquisition = acquire_ytdlp(item["url"], work)
            elif r == "tikhub":
                media, acquisition = acquire_tikhub(item["url"], work)
            elif r == "apify":
                media, acquisition = acquire_apify(item["url"], work)
            else:
                raise ValueError(r)
            out["attempts"].append({"route":r,"status":"completed","latency_s":round(time.time()-t0,3)})
            break
        except Exception as e:
            out["attempts"].append({"route":r,"status":"failed","latency_s":round(time.time()-t0,3),"error":str(e)[:1200]})

    if media is None:
        out["latency_s"] = round(time.time()-start,3)
        return out

    try:
        probe = ffprobe(media)
        dur = duration_seconds(probe)
        ev = extract_evidence(media, work / "evidence", dur)
        tr = transcribe_optional(ev["audio_path"])
        out.update({
            "status":"completed",
            "provider":acquisition["route"],
            "media_bytes":media.stat().st_size,
            "ffprobe":probe,
            "duration_s":dur,
            "evidence":ev,
            "transcript":tr,
            "latency_s":round(time.time()-start,3),
        })
        # Preserve provider response separately, not inside normalized result.
        raw = work / "provider_raw.json"
        raw.write_text(json.dumps(acquisition.get("raw"), ensure_ascii=False, indent=2), encoding="utf-8")
        out["provider_raw_path"] = str(raw)
    except Exception as e:
        out["status"] = "processing_failed"
        out["error"] = str(e)
        out["latency_s"] = round(time.time()-start,3)
    finally:
        if os.getenv("KEEP_MP4","0") != "1" and media and media.exists():
            try:
                media.unlink()
            except Exception:
                pass
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", default="barakat_batch8_urls.csv")
    ap.add_argument("--output-dir", default="spike_output")
    ap.add_argument("--limit", type=int, default=10)
    ap.add_argument("--route", choices=["auto","yt-dlp","tikhub","apify"], default="auto")
    args = ap.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        # allow execution from another cwd
        input_path = Path(__file__).resolve().parent / args.input
    with input_path.open(encoding="utf-8") as f:
        items = list(csv.DictReader(f))
    items = items[:args.limit]

    outroot = Path(args.output_dir)
    outroot.mkdir(parents=True, exist_ok=True)

    results = []
    for i, item in enumerate(items, 1):
        print(f"[{i}/{len(items)}] {item['concept']}", flush=True)
        r = run_one(item, outroot, args.route)
        print("  ", r["status"], r.get("provider",""), r.get("latency_s"), flush=True)
        results.append(r)
        with (outroot / "results.jsonl").open("a", encoding="utf-8") as f:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    completed = [r for r in results if r["status"] == "completed"]
    summary = {
        "total": len(results),
        "completed": len(completed),
        "success_rate": (len(completed)/len(results)) if results else 0,
        "human_handoffs": 0,  # this spike never requests cross-division files
        "median_latency_s": None,
        "routes": {},
    }
    if completed:
        vals = sorted(r["latency_s"] for r in completed)
        summary["median_latency_s"] = vals[len(vals)//2]
    for r in results:
        p = r.get("provider","none")
        summary["routes"][p] = summary["routes"].get(p,0)+1
    (outroot/"summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))

    # Exit non-zero if spike gate (<90%) fails.
    if summary["success_rate"] < 0.90:
        sys.exit(2)

if __name__ == "__main__":
    main()
