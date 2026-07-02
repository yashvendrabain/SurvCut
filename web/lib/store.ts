"use client";

import { create } from "zustand";
import type { SchemaResponse, UploadResponse, CrossCutResponse } from "./api-client";

export interface QueuedCrossCut {
  row: string;
  col: string;
  rowN: number;
  colN: number;
}

// ── Segmentation: a custom filter built from named groups. Each group is
// AND-across-conditions; each condition is OR-within-codes. First match wins;
// unmatched respondents fall into "Others" when includeOthers is set. ──
export interface SegmentPredicate {
  op: string;             // = <> > >= < <=
  value: string;
}
export interface SegmentCondition {
  id: string;
  column: string;         // any raw-data column
  predicates: SegmentPredicate[];   // OR'd together
}
export interface SegmentGroup {
  id: string;
  name: string;
  conditions: SegmentCondition[];   // AND'd together
}
export interface Segment {
  id: string;
  name: string;
  groups: SegmentGroup[];           // priority order
  includeOthers: boolean;
  othersLabel: string;
}

let _uid = 0;
export function newId(prefix = "id"): string {
  _uid += 1;
  return `${prefix}_${_uid}_${Math.floor(Math.random() * 1e6)}`;
}

interface WizardState {
  // Session
  sessionId: string | null;
  uploadSummary: UploadResponse | null;
  schema: SchemaResponse | null;

  // Themes: name → list of question_ids
  themes: Record<string, string[]>;
  themeOrder: string[];

  // Filter slots: question_ids used in the global filter block
  filterQids: string[];

  // Custom segments (custom filters tagged to every cut & cross-cut)
  segments: Segment[];

  // Cross-cut queue
  queuedCrossCuts: QueuedCrossCut[];
  currentXcut: {
    row: string;
    col: string;
    result: CrossCutResponse | null;
  };

  // Actions
  setUploadResult(u: UploadResponse): void;
  setSchema(s: SchemaResponse): void;
  addThemeRow(name: string): void;
  renameTheme(oldName: string, newName: string): void;
  removeTheme(name: string): void;
  toggleQuestionInTheme(themeName: string, qid: string): void;
  toggleFilter(qid: string): void;
  addSegment(): string;
  updateSegment(id: string, patch: Partial<Segment>): void;
  removeSegment(id: string): void;
  setXcutRow(qid: string): void;
  setXcutCol(qid: string): void;
  setXcutResult(r: CrossCutResponse | null): void;
  queueCurrentXcut(): void;
  removeQueuedXcut(idx: number): void;
  reset(): void;
}

export const useWizardStore = create<WizardState>((set, get) => ({
  sessionId: null,
  uploadSummary: null,
  schema: null,
  themes: {},
  themeOrder: [],
  filterQids: [],
  segments: [],
  queuedCrossCuts: [],
  currentXcut: { row: "", col: "", result: null },

  setUploadResult: (u) =>
    set({ sessionId: u.session_id, uploadSummary: u }),

  setSchema: (s) => {
    // Auto-populate themes based on Q-ID ranges as a starting point
    const byBucket: Record<string, string[]> = {};
    for (const q of s.questions) {
      if (!q.analysis_eligible) continue;
      const m = q.column_id.match(/^Q?(\d+)/i);
      const num = m ? parseInt(m[1], 10) : NaN;
      const bucket = isNaN(num) ? "Other" : `Q${Math.floor((num - 1) / 10) * 10 + 1}-Q${Math.floor((num - 1) / 10) * 10 + 10}`;
      (byBucket[bucket] ||= []).push(q.column_id);
    }
    const themeOrder = Object.keys(byBucket).sort((a, b) => {
      if (a === "Other") return 1;
      if (b === "Other") return -1;
      return a.localeCompare(b, undefined, { numeric: true });
    });
    // Auto-populate a few reasonable filter slots (first few single-select with option lists)
    const filterQids = s.questions
      .filter(q => q.analysis_eligible && q.question_type === "single_select" && q.n_options >= 2 && q.n_options <= 50)
      .slice(0, 8)
      .map(q => q.column_id);

    set({ schema: s, themes: byBucket, themeOrder, filterQids });
  },

  addThemeRow: (name) => {
    if (get().themes[name]) return;
    set(state => ({
      themes: { ...state.themes, [name]: [] },
      themeOrder: [...state.themeOrder, name],
    }));
  },

  renameTheme: (oldName, newName) => {
    if (oldName === newName || !newName || get().themes[newName]) return;
    set(state => {
      const next = { ...state.themes };
      next[newName] = next[oldName];
      delete next[oldName];
      return {
        themes: next,
        themeOrder: state.themeOrder.map(t => (t === oldName ? newName : t)),
      };
    });
  },

  removeTheme: (name) => set(state => {
    const next = { ...state.themes };
    delete next[name];
    return {
      themes: next,
      themeOrder: state.themeOrder.filter(t => t !== name),
    };
  }),

  toggleQuestionInTheme: (themeName, qid) => set(state => {
    // Remove qid from ALL themes first (each question in exactly one theme)
    const cleaned: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(state.themes)) {
      cleaned[k] = v.filter(x => x !== qid);
    }
    const wasIn = state.themes[themeName]?.includes(qid);
    if (!wasIn) {
      cleaned[themeName] = [...(cleaned[themeName] || []), qid];
    }
    return { themes: cleaned };
  }),

  toggleFilter: (qid) => set(state => ({
    filterQids: state.filterQids.includes(qid)
      ? state.filterQids.filter(x => x !== qid)
      : [...state.filterQids, qid].slice(0, 12),
  })),

  addSegment: () => {
    const id = newId("seg");
    const n = get().segments.length + 1;
    const seg: Segment = {
      id,
      name: `Segment ${n}`,
      groups: [{ id: newId("grp"), name: "Option 1", conditions: [] }],
      includeOthers: true,
      othersLabel: "Others",
    };
    set(state => ({ segments: [...state.segments, seg] }));
    return id;
  },

  updateSegment: (id, patch) => set(state => ({
    segments: state.segments.map(s => (s.id === id ? { ...s, ...patch } : s)),
  })),

  removeSegment: (id) => set(state => ({
    segments: state.segments.filter(s => s.id !== id),
  })),

  setXcutRow: (qid) => set(state => ({ currentXcut: { ...state.currentXcut, row: qid, result: null } })),
  setXcutCol: (qid) => set(state => ({ currentXcut: { ...state.currentXcut, col: qid, result: null } })),
  setXcutResult: (r) => set(state => ({ currentXcut: { ...state.currentXcut, result: r } })),

  queueCurrentXcut: () => set(state => {
    const cx = state.currentXcut;
    if (!cx.row || !cx.col || !cx.result) return {};
    return {
      queuedCrossCuts: [...state.queuedCrossCuts, {
        row: cx.row, col: cx.col,
        rowN: cx.result.row_labels.length,
        colN: cx.result.col_labels.length,
      }],
    };
  }),

  removeQueuedXcut: (idx) => set(state => ({
    queuedCrossCuts: state.queuedCrossCuts.filter((_, i) => i !== idx),
  })),

  reset: () => set({
    sessionId: null, uploadSummary: null, schema: null,
    themes: {}, themeOrder: [], filterQids: [], segments: [],
    queuedCrossCuts: [], currentXcut: { row: "", col: "", result: null },
  }),
}));