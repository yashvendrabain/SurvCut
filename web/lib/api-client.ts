/** Typed API client. During dev, `/api/*` is rewritten to http://localhost:8000/api/* (see next.config.ts). */

const BASE = "";  // relative — Next.js rewrite handles the origin

export interface UploadResponse {
  session_id: string;
  n_respondents: number;
  n_raw_columns: number;
  n_datamap_blocks: number;
  n_eligible_questions: number;
  validation_errors: string[];
  validation_warnings: string[];
}

export interface QuestionSummary {
  column_id: string;
  question_text: string;
  question_type: string;
  n_options: number;
  n_sub_columns: number;
  is_demographic: boolean;
  analysis_eligible: boolean;
}

export interface SchemaResponse {
  total_questions: number;
  analysis_eligible: number;
  total_respondents: number;
  questions: QuestionSummary[];
}

export interface CrossCutResponse {
  row_labels: string[];
  col_labels: string[];
  counts: number[][];
  warnings: string[];
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
  sessionId: string, rowQid: string, colQid: string
): Promise<CrossCutResponse> {
  const r = await fetch(`${BASE}/api/crosscuts/compute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, row_qid: rowQid, col_qid: colQid }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}