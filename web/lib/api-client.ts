/** Typed API client. `/api/*` is rewritten to http://localhost:8000/api/* by next.config.ts. */

const BASE = "";

export interface UploadResponse {
  session_id: string;
  n_respondents: number;
  n_raw_columns: number;
  n_datamap_blocks: number;
  n_eligible_questions: number;
  validation_errors: string[];
  validation_warnings: string[];
}

export interface OptionItem {
  code: string;
  label: string;
}

export interface QuestionSummary {
  column_id: string;
  question_text: string;
  question_type: string;
  n_options: number;
  n_sub_columns: number;
  is_demographic: boolean;
  analysis_eligible: boolean;
  options: OptionItem[];
  sub_options: OptionItem[];   // sub-column id → label (multi/grid/ranking)
}

// ── Dashboard preview selections (applied server-side before compute) ──
export interface FilterSelection { column_id: string; value: string; }
export interface SegmentSelection { name: string; value: string; }
export interface PreviewSelection {
  filter_selections?: FilterSelection[];
  segments?: SegmentPayload[];
  segment_selections?: SegmentSelection[];
}

export interface SegmentPredicatePayload {
  op: string;      // = <> > >= < <=
  value: string;
}
export interface SegmentConditionPayload {
  column: string;
  predicates: SegmentPredicatePayload[];   // combined by predicates_op
  predicates_op: string;                    // "OR" | "AND"
}
export interface SegmentGroupPayload {
  name: string;
  conditions: SegmentConditionPayload[];    // combined by conditions_op
  conditions_op: string;                    // "AND" | "OR"
}
export interface SegmentPayload {
  name: string;
  groups: SegmentGroupPayload[];
  include_others: boolean;
  others_label?: string;
}

export interface RawColumn {
  name: string;
  numeric: boolean;
  options: OptionItem[];
}

export interface SchemaResponse {
  total_questions: number;
  analysis_eligible: number;
  total_respondents: number;
  questions: QuestionSummary[];
  raw_columns: RawColumn[];
}

export interface CrossCutResponse {
  row_labels: string[];
  col_labels: string[];
  counts: number[][];
  warnings: string[];
}

export interface BuildResponse {
  workbook_path: string;
  size_bytes: number;
}

export async function uploadCombined(file: File): Promise<UploadResponse> {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch(`${BASE}/api/upload`, { method: "POST", body: fd });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getSchema(sessionId: string): Promise<SchemaResponse> {
  const r = await fetch(`${BASE}/api/schema/${sessionId}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function computeCrossCut(
  sessionId: string, rowQid: string, colQid: string, selection: PreviewSelection = {}
): Promise<CrossCutResponse> {
  const r = await fetch(`${BASE}/api/crosscuts/compute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, row_qid: rowQid, col_qid: colQid, ...selection }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function buildWorkbook(
  sessionId: string,
  themeNames: string[],
  themeQuestionIds: string[][],
  filterColumnIds: string[],
  queuedCrossCuts: Array<{ row_qid: string; col_qid: string }>,
  segments: SegmentPayload[] = []
): Promise<BuildResponse> {
  const r = await fetch(`${BASE}/api/export/build`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      theme_names: themeNames,
      theme_question_ids: themeQuestionIds,
      filter_column_ids: filterColumnIds,
      queued_cross_cuts: queuedCrossCuts,
      segments,
    }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export function downloadUrl(sessionId: string): string {
  return `${BASE}/api/export/download/${sessionId}`;
}

export interface CutRowData {
  label: string;
  count: number;
  pct: number;
}
export interface CutMatrix {
  row_labels: string[];
  col_labels: string[];
  counts: number[][];
}
export interface CutData {
  column_id: string;
  question_text: string;
  question_type: string;
  valid_n: number;
  headline_metric: string;
  value_is_mean: boolean;
  rows: CutRowData[];
  matrix?: CutMatrix | null;   // ranking: full ranks × options matrix
}

export async function getCuts(
  sessionId: string, columnIds: string[] = [], selection: PreviewSelection = {}
): Promise<CutData[]> {
  const r = await fetch(`${BASE}/api/cuts/compute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, column_ids: columnIds, ...selection }),
  });
  if (!r.ok) throw new Error(await r.text());
  const j = await r.json();
  return j.cuts as CutData[];
}