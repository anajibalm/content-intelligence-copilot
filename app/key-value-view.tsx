import { labelId } from '../lib/workspace/labels-id.ts';

export function KeyValueView({ value }: { value: unknown }) {
  let parsed = value;
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value); } catch { return <span className="preserve-text">{value}</span>; }
  }
  if (parsed == null) return <span className="muted">Belum tersedia</span>;
  if (typeof parsed === 'boolean') return <span>{parsed ? 'Ya' : 'Tidak'}</span>;
  if (Array.isArray(parsed)) return parsed.length ? <ul className="value-list">{parsed.map((item, index) => <li key={index}><KeyValueView value={item} /></li>)}</ul> : <span className="muted">Daftar kosong</span>;
  if (typeof parsed === 'object') return <dl className="key-values">{Object.entries(parsed).map(([key, item]) => <div key={key}><dt title={key}>{labelId(key)}</dt><dd><KeyValueView value={item} /></dd></div>)}</dl>;
  return <span className="preserve-text">{String(parsed)}</span>;
}
