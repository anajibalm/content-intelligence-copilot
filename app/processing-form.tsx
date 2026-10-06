"use client";

import { FormEvent, useState } from "react";

export default function ProcessingForm() {
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("Processing actual media…");
    try {
      const response = await fetch("/api/processing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Processing failed");
      setMessage("Completed. Reloading results…");
      window.location.reload();
    } catch (error) {
      setMessage(String((error as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="ingest-form" onSubmit={submit}>
      <label htmlFor="tiktok-url">Public TikTok URL</label>
      <div className="form-row">
        <input id="tiktok-url" name="url" type="url" required value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.tiktok.com/@.../video/..." />
        <button type="submit" disabled={busy}>{busy ? "Processing…" : "Process video"}</button>
      </div>
      <p className="form-message" aria-live="polite">{message}</p>
    </form>
  );
}
