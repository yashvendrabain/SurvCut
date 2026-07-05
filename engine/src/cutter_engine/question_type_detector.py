"""Question type detection — the SWAP-POINT for type identification.

────────────────────────────────────────────────────────────────────────────
WHY THIS IS A SEPARATE MODULE
────────────────────────────────────────────────────────────────────────────
The current detection is heuristic — it reads the `Values: M-N` hint, the
question text, and the option labels, then makes a best guess at the type.
This works for the surveys we've seen, but it's not authoritative.

When you're ready to move to an EXPLICIT format (e.g. a `Type: ranking` line
declared in the datamap for every question), replace ONLY this module. The
rest of the cuts engine (parser, classifier, single-cut, cross-cut, exporter)
doesn't need to change — they call `detect_type(block)` and trust whatever
type comes back.

────────────────────────────────────────────────────────────────────────────
PUBLIC API — keep stable
────────────────────────────────────────────────────────────────────────────
    detect_type(block: ParsedBlock) -> tuple[QuestionType, tuple[int, int] | None]

That's it. One function. Returns the type and (lo, hi) numeric range if
parseable from the type hint. Any replacement module just needs to expose
this single function with the same signature.

────────────────────────────────────────────────────────────────────────────
DECISION TREE (legend-aware; allocation is confirmed against the data in classify)
────────────────────────────────────────────────────────────────────────────
1.  hint = "Open numeric response"        → DIRECT_NUMERIC
2.  hint = "Open text response"           → OPEN_TEXT
3.  hint doesn't parse as "Values: M-N"   → UNKNOWN
    has_subs   = block has [SubColID] rows
    has_legend = block has value→label rows (a coded legend)
    With sub-columns:
      a. _is_ranking_question ("rank" in text OR ≥2 "Rank N" labels) → RANKING
      b. range (0,1)  (0=Unchecked / 1=Checked legend)              → MULTI_SELECT_BINARY
      c. has_legend   (descriptive value→label legend)              → GRID_RATED
      d. no legend    (free numeric entry per column)               → NUMERIC_GRID
         └ classify() promotes NUMERIC_GRID → NUMERIC_ALLOCATION when there are
           ≥2 columns AND every answered row sums to exactly 100 ("likert").
    Without sub-columns:
      range (0,1) → BINARY_TWO_OPTIONS ;  otherwise → SINGLE_SELECT
    (NPS is no longer special-cased — a 0-10 single column is just SINGLE_SELECT.)
"""
from __future__ import annotations

import re

from .models import ParsedBlock, QuestionType


# ───────────────────────────────────────────────────────────────────────────
# Patterns — kept module-level so they compile once
# ───────────────────────────────────────────────────────────────────────────

# Type-hint patterns (col A of the row directly under a question header)
VALUES_RANGE_RE = re.compile(
    r"^Values\s*:\s*(-?\d+)\s*-\s*(-?\d+)\s*$", re.IGNORECASE
)
OPEN_NUMERIC_RE = re.compile(r"^Open\s+numeric\s+response$", re.IGNORECASE)
OPEN_TEXT_RE = re.compile(r"^Open\s+text\s+response$", re.IGNORECASE)

# NPS — promoted from a 0-10 single-column question when the text mentions it.
# Without the keyword the question stays a SINGLE_SELECT, which is also fine.
NPS_KEYWORDS = ("nps", "recommend")

# Ranking — two complementary datamap signals (see _is_ranking_question docs)
RANKING_TEXT_RE = re.compile(r"\branke?\w*\b", re.IGNORECASE)
RANK_LABEL_RE = re.compile(r"^\s*rank\s+\d+\s*$", re.IGNORECASE)


# ───────────────────────────────────────────────────────────────────────────
# Helpers (private — exported via detect_type only)
# ───────────────────────────────────────────────────────────────────────────


def _is_ranking_question(block: ParsedBlock) -> bool:
    """Return True iff the block is a ranking question per the two signals.

    Signal A (text):   the question text contains "rank" / "ranks" / "ranked"
                       / "ranking" as a whole word. Word-boundary regex
                       avoids false positives like "frankly" or "outranking".

    Signal B (labels): option labels follow the "Rank N" pattern, e.g.
                       "Rank 1", "rank  3", "Rank 5". When at least 2 of the
                       block's options match this pattern, the scale is
                       definitively rank positions (not Likert).

    Either signal suffices. Neither → not ranking.
    """
    if RANKING_TEXT_RE.search(block.question_text or ""):
        return True
    rank_label_hits = sum(
        1
        for _code, label in block.scale_options
        if isinstance(label, str) and RANK_LABEL_RE.match(label)
    )
    return rank_label_hits >= 2


# ───────────────────────────────────────────────────────────────────────────
# Public API
# ───────────────────────────────────────────────────────────────────────────


def detect_type(
    block: ParsedBlock,
) -> tuple[QuestionType, tuple[int, int] | None]:
    """Decide a question's type from its parsed block.

    Returns (QuestionType, scale_range) where scale_range is the (lo, hi)
    pair from "Values: M-N", or None when the question is open-numeric /
    open-text / unknown.

    This function is the contract every replacement implementation must
    honour. Keep the signature stable.
    """
    hint = block.type_hint.strip()

    # 1. Open numeric
    if OPEN_NUMERIC_RE.match(hint):
        return QuestionType.DIRECT_NUMERIC, None

    # 2. Open text
    if OPEN_TEXT_RE.match(hint):
        return QuestionType.OPEN_TEXT, None

    # 3. Parse the numeric range
    match = VALUES_RANGE_RE.match(hint)
    if not match:
        return QuestionType.UNKNOWN, None
    lo, hi = int(match.group(1)), int(match.group(2))

    has_subs = bool(block.sub_columns)
    has_legend = bool(block.scale_options)   # value→label rows present in the datamap
    is_ranking = _is_ranking_question(block)

    # ── Multi-column blocks: distinguish by the legend, then (for legend-less
    #    numeric grids) by the data in classify(). ──────────────────────────
    if has_subs:
        # Ranking — legend labels are "Rank N" (or "rank" appears in the text).
        if is_ranking:
            return QuestionType.RANKING, (lo, hi)
        # Select-all — coded 0/1 legend (0=Unchecked, 1=Checked).
        if (lo, hi) == (0, 1):
            return QuestionType.MULTI_SELECT_BINARY, (lo, hi)
        # A descriptive value→label legend → rated / non-numerical grid.
        if has_legend:
            return QuestionType.GRID_RATED, (lo, hi)
        # No legend → free numeric entry per column. NUMERIC_GRID is the default;
        # classify() promotes it to NUMERIC_ALLOCATION ("likert" constant-sum)
        # only when every answered row sums to exactly 100 (needs the data).
        return QuestionType.NUMERIC_GRID, (lo, hi)

    # ── Single-column blocks. ────────────────────────────────────────────────
    if (lo, hi) == (0, 1):
        return QuestionType.BINARY_TWO_OPTIONS, (lo, hi)
    return QuestionType.SINGLE_SELECT, (lo, hi)