"use client";

import { useEffect, useState } from "react";
import { labelId } from '../lib/workspace/labels-id.ts';

type Batch = { id: string; name: string; brandId: string };
type Note = { id: string; body: string; author: string; updatedAt: string };
type NextTest = { id: string; variableToTest: string; variantA: string; variantB: string; controls: string; expectedResult: string; owner: string; successMetric: string; measurementWindow: string; targetBatchId: string; status: string; updatedAt: string };
type Mode = 'create' | 'edit' | null;
type S10Data = { batches?: Batch[]; notes?: Note[]; nextTests?: NextTest[]; error?: string };

const EMPTY_TEST = { variableToTest: "", variantA: "", variantB: "", controls: "", expectedResult: "", owner: "", successMetric: "", measurementWindow: "", targetBatchId: "" };
const FIELDS: Array<[keyof typeof EMPTY_TEST, string]> = [['variableToTest', 'Variabel yang diuji'], ['variantA', 'Varian A'], ['variantB', 'Varian B'], ['controls', 'Kontrol'], ['expectedResult', 'Hasil yang diharapkan'], ['owner', 'Penanggung jawab'], ['successMetric', 'Metrik keberhasilan'], ['measurementWindow', 'Periode pengukuran']];
const STATUSES = ['PROPOSED', 'ACCEPTED', 'RUNNING', 'COMPLETED', 'CANCELLED'];

function statusLabel(status: string) { return status === 'RUNNING' ? 'Berjalan' : labelId(status); }

export function S10Panel({ hypothesisId, targetBatchId }: { hypothesisId: string; targetBatchId: string }) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [tests, setTests] = useState<NextTest[]>([]);
  const [author, setAuthor] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [test, setTest] = useState({ ...EMPTY_TEST, targetBatchId });
  const [noteMode, setNoteMode] = useState<Mode>(null);
  const [testMode, setTestMode] = useState<Mode>(null);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [editingTest, setEditingTest] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [version, setVersion] = useState(0);

  function apply(data: S10Data) {
    setBatches(data.batches ?? []);
    setNotes(data.notes ?? []);
    setTests(data.nextTests ?? []);
  }

  async function getS10() {
    const response = await fetch(`/api/hypotheses/${hypothesisId}/s10`);
    const body = await response.json() as S10Data;
    if (!response.ok) throw new Error(body.error ?? 'Data Catatan dan Rencana Uji tidak tersedia');
    return body;
  }

  useEffect(() => {
    let active = true;
    fetch(`/api/hypotheses/${hypothesisId}/s10`).then(async (response) => {
      const data = await response.json() as S10Data;
      if (!response.ok) throw new Error(data.error ?? 'Data Catatan dan Rencana Uji tidak tersedia');
      if (active) apply(data);
    }).catch((reason: unknown) => {
      if (active) setLoadError(reason instanceof Error ? reason.message : 'Data Catatan dan Rencana Uji tidak tersedia');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [hypothesisId, version]);

  function retry() { setWriteError(null); setLoadError(null); setLoading(true); setVersion((value) => value + 1); }
  function resetNote() { setNoteMode(null); setEditingNote(null); setAuthor(""); setNoteBody(""); }
  function resetTest() { setTestMode(null); setEditingTest(null); setTest({ ...EMPTY_TEST, targetBatchId }); }
  function openNote() { setWriteError(null); resetNote(); setNoteMode('create'); }
  function openTest() { setWriteError(null); resetTest(); setTestMode('create'); }
  function editNote(item: Note) { setWriteError(null); setNoteMode('edit'); setEditingNote(item.id); setAuthor(item.author); setNoteBody(item.body); }
  function editTest(item: NextTest) { setWriteError(null); setTestMode('edit'); setEditingTest(item.id); setTest({ variableToTest: item.variableToTest, variantA: item.variantA, variantB: item.variantB, controls: item.controls, expectedResult: item.expectedResult, owner: item.owner, successMetric: item.successMetric, measurementWindow: item.measurementWindow, targetBatchId: item.targetBatchId }); }

  async function refresh(message: string) {
    try { apply(await getS10()); }
    catch { setWriteError(message); }
  }

  async function saveNote() {
    if (!author.trim() || !noteBody.trim()) return;
    setPending(true);
    setWriteError(null);
    try {
      const response = await fetch(editingNote ? `/api/hypotheses/${hypothesisId}/s10/notes/${editingNote}` : `/api/hypotheses/${hypothesisId}/s10`, { method: editingNote ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(editingNote ? { body: noteBody, author } : { kind: 'NOTE', body: noteBody, author }) });
      const body = await response.json() as Note & { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Catatan gagal disimpan');
      setNotes((current) => editingNote ? current.map((item) => item.id === editingNote ? body : item) : [...current, body]);
      resetNote();
      await refresh('Penyimpanan berhasil, tetapi daftar gagal dimuat. Coba lagi untuk memuat daftar terbaru.');
    } catch (reason) { setWriteError(reason instanceof Error ? reason.message : 'Catatan gagal disimpan'); }
    finally { setPending(false); }
  }

  async function saveTest() {
    if (FIELDS.some(([key]) => !test[key].trim()) || !test.targetBatchId) return;
    setPending(true);
    setWriteError(null);
    try {
      const response = await fetch(editingTest ? `/api/hypotheses/${hypothesisId}/s10/next-tests/${editingTest}` : `/api/hypotheses/${hypothesisId}/s10`, { method: editingTest ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(editingTest ? test : { kind: 'NEXT_TEST', ...test }) });
      const body = await response.json() as NextTest & { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Rencana Uji gagal disimpan');
      setTests((current) => editingTest ? current.map((item) => item.id === editingTest ? body : item) : [...current, body]);
      resetTest();
      await refresh('Penyimpanan berhasil, tetapi daftar gagal dimuat. Coba lagi untuk memuat daftar terbaru.');
    } catch (reason) { setWriteError(reason instanceof Error ? reason.message : 'Rencana Uji gagal disimpan'); }
    finally { setPending(false); }
  }

  async function changeStatus(item: NextTest, status: string) {
    setPending(true);
    setWriteError(null);
    try {
      const response = await fetch(`/api/hypotheses/${hypothesisId}/s10/next-tests/${item.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }) });
      const body = await response.json() as NextTest & { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Status Rencana Uji gagal disimpan');
      setTests((current) => current.map((value) => value.id === item.id ? body : value));
      await refresh('Status berhasil disimpan, tetapi daftar gagal dimuat. Coba lagi untuk memuat daftar terbaru.');
    } catch (reason) { setWriteError(reason instanceof Error ? reason.message : 'Status Rencana Uji gagal disimpan'); }
    finally { setPending(false); }
  }

  const noteInvalid = !author.trim() || !noteBody.trim();
  const testInvalid = FIELDS.some(([key]) => !test[key].trim()) || !test.targetBatchId;
  return <section className="s10-panel" aria-labelledby="s10-heading">
    <h3 id="s10-heading">Catatan dan Rencana Uji</h3>
    <p className="muted">Catatan adalah konteks manusia, bukan evidence dan tidak menaikkan confidence.</p>
    {writeError && <div role="alert"><p className="error-state">{writeError}</p><button className="secondary" type="button" onClick={retry}>Coba lagi</button></div>}
    {loading ? <p role="status">Memuat Catatan dan Rencana Uji…</p> : loadError ? <div role="alert"><p className="error-state">{loadError}</p><button className="secondary" type="button" onClick={retry}>Coba lagi</button></div> : <>
      <section className="s10-notes" aria-labelledby="notes-heading">
        <div className="s10-section-heading"><h4 id="notes-heading">Catatan</h4>{noteMode === null && <button className="secondary" type="button" onClick={openNote}>Tambah Catatan</button>}</div>
        {notes.length === 0 && noteMode === null && <p className="empty-state">Belum ada Catatan tersimpan. Gunakan Tambah Catatan untuk membuatnya.</p>}
        {notes.map((item) => <article key={item.id}><p className="preserve-text">{item.body}</p><small>{item.author} · {item.updatedAt}</small><button className="secondary" type="button" disabled={pending} onClick={() => editNote(item)}>Edit Catatan</button></article>)}
        {noteMode !== null && <div className="s10-editor"><h5>{noteMode === 'edit' ? 'Edit Catatan' : 'Tambah Catatan'}</h5><label>Penulis<input value={author} onChange={(event) => setAuthor(event.target.value)} /></label><label>Catatan<textarea value={noteBody} onChange={(event) => setNoteBody(event.target.value)} /></label>{noteInvalid && <p className="inline-validation">Penulis dan Catatan wajib diisi.</p>}<div className="s10-actions"><button type="button" onClick={saveNote} disabled={pending || noteInvalid}>{pending ? 'Menyimpan…' : noteMode === 'edit' ? 'Simpan edit Catatan' : 'Simpan Catatan'}</button><button className="secondary" type="button" disabled={pending} onClick={resetNote}>Batal Catatan</button></div></div>}
      </section>
      <section className="s10-next-test" aria-labelledby="next-test-heading">
        <div className="s10-section-heading"><h4 id="next-test-heading">Rencana Uji</h4>{testMode === null && <button className="secondary" type="button" onClick={openTest}>Buat Rencana Uji</button>}</div>
        <p className="muted">Selesai adalah status pelaksanaan yang dicatat, bukan bukti hasil atau dukungan hipotesis.</p>
        {tests.length === 0 && testMode === null && <p className="empty-state">Belum ada Rencana Uji tersimpan. Saran AI tidak membuat rencana otomatis. Gunakan Buat Rencana Uji untuk membuatnya.</p>}
        {tests.map((item) => <article key={item.id}><strong>{item.variableToTest}</strong><dl className="key-values">{FIELDS.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{item[key]}</dd></div>)}<div><dt>Batch tujuan</dt><dd>{batches.find((batch) => batch.id === item.targetBatchId)?.name ?? item.targetBatchId}</dd></div></dl><p>Status: {statusLabel(item.status)}</p><div className="s10-actions"><button className="secondary" type="button" disabled={pending} onClick={() => editTest(item)}>Edit Rencana Uji</button><label>Status<select aria-label={`Status ${item.id}`} value={item.status} disabled={pending} onChange={(event) => changeStatus(item, event.target.value)}>{STATUSES.map((status) => <option value={status} key={status}>{statusLabel(status)}</option>)}</select></label></div></article>)}
        {testMode !== null && <div className="s10-editor"><h5>{testMode === 'edit' ? 'Edit Rencana Uji' : 'Buat Rencana Uji'}</h5><p className="muted">Isi sembilan field wajib. Draft tetap tersedia bila penyimpanan gagal.</p>{FIELDS.map(([key, label]) => <label key={key}>{label}<input value={test[key]} onChange={(event) => setTest((current) => ({ ...current, [key]: event.target.value }))} /></label>)}<label>Batch tujuan<select aria-label="Batch tujuan" value={test.targetBatchId} onChange={(event) => setTest((current) => ({ ...current, targetBatchId: event.target.value }))}><option value="">Pilih Batch tujuan</option>{batches.map((batch) => <option value={batch.id} key={batch.id}>{batch.name}</option>)}</select></label>{testInvalid && <p className="inline-validation">Semua sembilan field Rencana Uji wajib diisi.</p>}<div className="s10-actions"><button type="button" onClick={saveTest} disabled={pending || testInvalid}>{pending ? 'Menyimpan…' : testMode === 'edit' ? 'Simpan edit Rencana Uji' : 'Simpan Rencana Uji'}</button><button className="secondary" type="button" disabled={pending} onClick={resetTest}>Batal Rencana Uji</button></div></div>}
      </section>
    </>}
  </section>;
}
