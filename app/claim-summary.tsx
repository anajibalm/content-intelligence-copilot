import { labelId } from '../lib/workspace/labels-id.ts';
import { presentStatement, type StatementSegment } from '../lib/hypothesis/presentation.ts';

export function ClaimSummary({ segments, contentNames }: { segments: StatementSegment[]; contentNames: Map<string, string> }) {
  const labels: Record<string, string> = { OBSERVED: 'Observasi', DERIVED: 'Hitungan', INFERRED: 'Dugaan', EXTRACTED: 'Ekstraksi AI' };
  return <div className="statement-presentation">{segments.map((segment, index) => {
    const presentation = presentStatement(segment.text, contentNames);
    return <div className="statement-segment" key={`${index}-${segment.layer ?? 'plain'}`}>
      {segment.layer && <span className="ontology-chip">{labels[segment.layer] ?? labelId(segment.layer)}</span>}
      <span>{presentation.segments.map((part) => part.text).join('')}</span>
      {presentation.unknown.length > 0 && <span className="unknown-id-warning" role="status">ID tidak dikenal: {presentation.unknown.join(', ')}</span>}
    </div>;
  })}</div>;
}
