"use client";

import { useState } from "react";

export interface EvidenceFrame {
  id?: string;
  timestampMs: number;
  storagePath: string;
  frameType?: string;
}

export default function EvidenceFrames({ jobId, frames }: { jobId: string; frames: EvidenceFrame[] }) {
  const [saved, setSaved] = useState<string | null>(null);

  async function save(frame: EvidenceFrame) {
    if (!frame.id) return;
    const response = await fetch(`/api/processing/${jobId}/anchors`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ frameId: frame.id }),
    });
    if (!response.ok) return;
    setSaved(frame.id);
  }

  return (
    <div className="evidence-frames">
      {frames.map((frame) => (
        <figure key={`${frame.id ?? frame.frameType}-${frame.timestampMs}`}>
          <img src={frame.storagePath} alt={`${frame.frameType ?? "frame"} at ${frame.timestampMs}ms`} />
          <figcaption>
            {frame.frameType} · {frame.timestampMs}ms
            {frame.id && <button type="button" onClick={() => save(frame)} disabled={saved === frame.id}>{saved === frame.id ? "Saved" : "Save product entry"}</button>}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
