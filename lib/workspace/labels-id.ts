export const VIEW_LABELS = { batch: 'Batch', library: 'Library', compare: 'Compare', review: 'Review' };
const LABELS: Record<string, string> = {
  views: 'Tayangan', awt_seconds: 'Rata-rata waktu tonton', wfv_pct: 'Tonton sampai selesai', engagement_rate: 'Rasio interaksi', likes: 'Suka', comments: 'Komentar', shares: 'Bagikan', saves: 'Simpan',
  ORGANIC: 'Organik', PAID: 'Iklan', VALID: 'Valid', MISSING: 'Belum tersedia', UNAVAILABLE: 'Belum tersedia', SUSPECT: 'Perlu diperiksa', DERIVED: 'Hasil perhitungan', OBSERVED: 'Observasi', EXTRACTED: 'Ekstraksi AI', INFERRED: 'Hipotesis',
  LOW: 'Rendah', MEDIUM: 'Sedang', HIGH: 'Tinggi', UNREVIEWED: 'Menunggu review', CONFIRMED: 'Dikonfirmasi', CORRECTED: 'Dikoreksi', REJECTED: 'Ditolak', REVIEWED: 'Direview', CORRECT: 'Dikoreksi', CONFIRM: 'Konfirmasi', APPROVE: 'Disetujui', EDIT: 'Diedit', REJECT: 'Ditolak',
  PENDING: 'Menunggu', RUNNING: 'Diproses', FAILED: 'Gagal', COMPLETED: 'Selesai', SUCCEEDED: 'Berhasil', QUEUED: 'Dalam antrean', PLANNED: 'Direncanakan', DRAFT: 'Draf', CANCELLED: 'Dibatalkan',
  PROPOSED: 'Diusulkan', ACCEPTED: 'Diterima', TESTING: 'Diuji', SUPPORTED: 'Didukung', CONTRADICTED: 'Bertentangan', INCONCLUSIVE: 'Belum pasti', RETIRED: 'Dihentikan',
  CONTROLLED: 'Perbandingan terkontrol', PERFORMANCE_CONTRAST: 'Kontras eksploratif', MANUAL: 'Manual', PAIR: 'Pasangan', GROUP: 'Kelompok', BATCH: 'Batch', SUPPORTING: 'Pendukung', CONTRADICTING: 'Bertentangan', CONTEXTUAL: 'Konteks',
  HOOK: 'Pembuka', SCENE: 'Adegan', REPRESENTATIVE: 'Representatif', TRANSCRIPT_SEGMENT: 'Segmen transkrip', VIDEO_FRAME: 'Frame video', CONTENT_FEATURE: 'Field fingerprint', METRIC_SNAPSHOT: 'Snapshot metrik',
  MET: 'Tercapai', NOT_MET: 'Belum tercapai', UNCONFIGURED: 'Belum dikonfigurasi', ASC: 'Naik', DESC: 'Turun',
  topic: 'Topik', hook_subject: 'Subjek pembuka', talent_type: 'Jenis talent', talent_familiarity: 'Familiaritas talent',
  hook_type: 'Jenis pembuka', hook_visual: 'Visual pembuka', hook_verbal: 'Kalimat pembuka', opening_style: 'Gaya pembuka', format: 'Format', talent_class: 'Kelas talent', pacing: 'Tempo', narrative_structure: 'Struktur narasi', emotional_trigger: 'Pemicu emosi', tension_type: 'Jenis ketegangan', product_placement: 'Penempatan produk', cta_type: 'Jenis CTA', on_screen_text: 'Teks layar',
  same_pillar: 'Pilar sama', same_format: 'Format sama', same_talent_class: 'Kelas talent sama', duration_match: 'Durasi sebanding', content_age_match: 'Umur konten sebanding', distribution_match: 'Distribusi sama', duration_delta_seconds: 'Selisih durasi (detik)', content_age_delta_hours: 'Selisih umur (jam)', review_state: 'Status review', metric_quality_state: 'Kualitas metrik',
  action: 'Tindakan', hypothesis: 'Hipotesis', variable_to_test: 'Variabel yang diuji', variableToTest: 'Variabel yang diuji', variant_a: 'Varian A', variantA: 'Varian A', variant_b: 'Varian B', variantB: 'Varian B', controls: 'Kontrol', expected_result: 'Hasil yang diharapkan', owner: 'Penanggung jawab', success_metric: 'Metrik keberhasilan', measurement_window: 'Periode pengukuran', target_batch: 'Batch tujuan',
  statement: 'Pernyataan', source: 'Sumber', sourceSnapshotId: 'ID snapshot sumber', capturedAt: 'Waktu snapshot', distribution: 'Distribusi', quality: 'Kualitas', qualityJson: 'Kualitas per metrik', rawObservations: 'Observasi mentah', sourceMetricNames: 'Metrik sumber', formulaVersion: 'Versi formula', aiValue: 'AI asli', reviewedValue: 'Hasil review', reviewState: 'Status review', qualityState: 'Kualitas', value: 'Nilai', reason: 'Alasan',
};
const REASONS: Record<string, string> = {
  INSUFFICIENT_SAMPLE: 'Sampel belum cukup untuk confidence tinggi.', ONE_COMPARISON: 'Satu perbandingan belum membuktikan pola yang bertahan.', LEGACY_ONLY: 'Bukti yang dirujuk belum memuat interpretasi hasil ekstraksi; confidence maksimal sedang.', COMPARISON_QUALITY: 'Kualitas perbandingan membatasi confidence.', SUSPECT_PRIMARY_METRIC: 'Metrik utama perlu diperiksa, bukan bukti kuat.', UNAVAILABLE_PERFORMANCE: 'Bukti performa belum tersedia.', UNREVIEWED_EXTRACTED: 'Ekstraksi yang dirujuk belum direview, ditolak, atau kualitasnya belum memadai.',
  WRONG_METRIC_INTERPRETATION: 'Interpretasi metrik salah', OVERCLAIM: 'Klaim melebihi bukti', MISSING_VARIABLE: 'Variabel belum diperhitungkan', BAD_DATA: 'Data bermasalah', NOT_ACCESSIBLE: 'Sumber tidak dapat diakses.', SOURCE_ERROR: 'Sumber melaporkan error.', MANUAL_CHECK_REQUIRED: 'Perlu pemeriksaan manual.',
  NOT_PROVIDED: 'Nilai belum diberikan.', UNEXPLAINED_ZERO: 'Nilai nol belum memiliki penjelasan atau provenance yang memadai.', INVALID_VALUE: 'Nilai atau metrik sumber tidak valid.', SNAPSHOT_QUALITY: 'Kualitas mengikuti snapshot sumber.', WRONG_CLASSIFICATION: 'Klasifikasi salah', MISSED_VISUAL_CONTEXT: 'Konteks visual terlewat', MISSED_DIALOGUE: 'Dialog terlewat', HALLUCINATION: 'Informasi tidak didukung sumber', TOO_GENERIC: 'Terlalu umum', WRONG_CAUSALITY: 'Klaim kausal tidak tepat', INSUFFICIENT_EVIDENCE: 'Bukti tidak cukup', OTHER: 'Alasan lain',
};
export function labelId(value: string) { return LABELS[value] ?? REASONS[value] ?? value; }
export function reasonId(value: string) { return REASONS[value] ?? labelId(value); }
export function metricTextId(value: number | null | undefined, metric: string) {
  if (value == null) return 'Belum tersedia';
  if (metric === 'engagement_rate' || metric === 'wfv_pct') return `${(value * 100).toFixed(1)}%`;
  if (metric === 'awt_seconds') return `${value.toFixed(2)} s`;
  return String(value);
}
