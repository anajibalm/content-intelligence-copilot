"use client";

import { useEffect, useState } from "react";

type Note = { id: string; body: string; author: string; updatedAt: string };
type NextTest = { id: string; variableToTest: string; variantA: string; variantB: string; controls: string; expectedResult: string; owner: string; successMetric: string; measurementWindow: string; targetBatchId: string; status: string; updatedAt: string };
const EMPTY_TEST = { variableToTest: "", variantA: "", variantB: "", controls: "", expectedResult: "", owner: "", successMetric: "", measurementWindow: "" };

export function S10Panel({ hypothesisId, targetBatchId }: { hypothesisId: string; targetBatchId: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [tests, setTests] = useState<NextTest[]>([]);
  const [noteBody, setNoteBody] = useState("");
  const [author, setAuthor] = useState("");
  const [test, setTest] = useState(EMPTY_TEST);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [editingTest, setEditingTest] = useState<string | null>(null);

  async function load() {
    const response = await fetch(`/api/hypotheses/${hypothesisId}/s10`);
    const body = await response.json() as { notes?: Note[]; nextTests?: NextTest[]; error?: string };
    if (!response.ok) throw new Error(body.error ?? "S10 data unavailable");
    setNotes(body.notes ?? []); setTests(body.nextTests ?? []);
  }
  useEffect(() => {
    fetch(`/api/hypotheses/${hypothesisId}/s10`).then(async (response) => {
      const body = await response.json() as { notes?: Note[]; nextTests?: NextTest[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "S10 data unavailable");
      setNotes(body.notes ?? []); setTests(body.nextTests ?? []);
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "S10 data unavailable"));
  }, [hypothesisId]);
  async function saveNote() {
    setPending(true); setError(null);
    try {
      const url = editingNote ? `/api/hypotheses/${hypothesisId}/s10/notes/${editingNote}` : `/api/hypotheses/${hypothesisId}/s10`;
      const response = await fetch(url, { method: editingNote ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(editingNote ? { body: noteBody, author } : { kind: "NOTE", body: noteBody, author }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "note save failed");
      setNoteBody(""); setEditingNote(null); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "note save failed"); } finally { setPending(false); }
  }
  async function saveTest() {
    setPending(true); setError(null);
    try {
      const url = editingTest ? `/api/hypotheses/${hypothesisId}/s10/next-tests/${editingTest}` : `/api/hypotheses/${hypothesisId}/s10`;
      const payload = editingTest ? test : { kind: "NEXT_TEST", ...test, targetBatchId };
      const response = await fetch(url, { method: editingTest ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Next Test save failed");
      setTest(EMPTY_TEST); setEditingTest(null); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Next Test save failed"); } finally { setPending(false); }
  }
  function editNote(note: Note) { setEditingNote(note.id); setNoteBody(note.body); setAuthor(note.author); }
  function editTest(item: NextTest) { setEditingTest(item.id); setTest({ variableToTest: item.variableToTest, variantA: item.variantA, variantB: item.variantB, controls: item.controls, expectedResult: item.expectedResult, owner: item.owner, successMetric: item.successMetric, measurementWindow: item.measurementWindow }); }
  async function changeStatus(item: NextTest, status: string) { setPending(true); setError(null); try { const response = await fetch(`/api/hypotheses/${hypothesisId}/s10/next-tests/${item.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) }); const body = await response.json() as { error?: string }; if (!response.ok) throw new Error(body.error ?? "status update failed"); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "status update failed"); } finally { setPending(false); } }
  const fields: Array<[keyof typeof EMPTY_TEST, string]> = [["variableToTest", "Variable yang diuji"], ["variantA", "Variant A"], ["variantB", "Variant B"], ["controls", "Controls"], ["expectedResult", "Expected result"], ["owner", "Owner"], ["successMetric", "Success metric"], ["measurementWindow", "Measurement window"]];
  return <section className="s10-panel" aria-labelledby="s10-heading">
    <h3 id="s10-heading">Notes & Next Test</h3>
    <p className="muted">Catatan adalah konteks manusia, bukan evidence dan tidak menaikkan confidence.</p>
    {error && <p className="error-state" role="alert">{error}</p>}
    <div className="s10-notes"><h4>Analyst notes</h4><label>Author<input value={author} onChange={(event) => setAuthor(event.target.value)} /></label><label>Note<textarea value={noteBody} onChange={(event) => setNoteBody(event.target.value)} /></label><button type="button" onClick={saveNote} disabled={pending || !author.trim() || !noteBody.trim()}>{editingNote ? "Save note edit" : "Save note"}</button>{notes.map((note) => <article key={note.id}><p>{note.body}</p><small>{note.author} · {note.updatedAt}</small><button type="button" onClick={() => editNote(note)}>Edit</button></article>)}</div>
    <div className="s10-next-test"><h4>Structured Next Test</h4>{fields.map(([key, label]) => <label key={key}>{label}<input value={test[key]} onChange={(event) => setTest((current) => ({ ...current, [key]: event.target.value }))} /></label>)}<button type="button" onClick={saveTest} disabled={pending || fields.some(([key]) => !test[key].trim())}>{editingTest ? "Save Next Test edit" : "Create Next Test"}</button>{tests.map((item) => <article key={item.id}><strong>{item.variableToTest}</strong><p>Expected: {item.expectedResult} · Owner: {item.owner} · Metric: {item.successMetric} · Window: {item.measurementWindow}</p><p>Status: {item.status} · Test ID: {item.id}</p><button type="button" onClick={() => editTest(item)}>Edit</button><select aria-label={`Status ${item.id}`} value={item.status} disabled={pending} onChange={(event) => changeStatus(item, event.target.value)}><option>PROPOSED</option><option>ACCEPTED</option><option>RUNNING</option><option>COMPLETED</option><option>CANCELLED</option></select></article>)}</div>
  </section>;
}
