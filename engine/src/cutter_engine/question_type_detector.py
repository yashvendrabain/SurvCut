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
CURRENT DECISION TREE (heuristic — to be replaced later)
────────────────────────────────────────────────────────────────────────────
1.  hint = "Open numeric response"        → DIRECT_NUMERIC
2.  hint = "Open text response"           → OPEN_TEXT
3.  hint doesn't parse as "Values: M-N"   → UNKNOWN
4.  range (0,10) + "nps"/"recommend" text
    AND no sub-cols                       → NPS
    (without keyword → falls through to single-select)
5.  range (0,100) + has sub-cols          → NUMERIC_ALLOCATION
6.  range (0,1)   + has sub-cols          → MULTI_SELECT_BINARY
7.  range (0,1)   + no  sub-cols          → BINARY_TWO_OPTIONS
8a. has sub-cols AND _is_ranking_question → RANKING
    (datamap signals: "rank" word in text OR ≥2 "Rank N" option labels)
8b. has sub-cols (any other range)        → GRID_RATED
9.  no sub-cols (default)                 → SINGLE_SELECT
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
    qtext_lower = (block.question_text or "").lower()
    is_nps_text = any(kw in qtext_lower for kw in NPS_KEYWORDS)
    is_ranking = _is_ranking_question(block)

    # 4. NPS (PROMOTE — not a hard requirement; without keyword falls through
    #    to SINGLE_SELECT which is also valid output).
    if (lo, hi) == (0, 10) and is_nps_text and not has_subs:
        return QuestionType.NPS, (lo, hi)

    # 5. Numeric allocation (0..100 with sub-cols, e.g. % share allocation)
    if (lo, hi) == (0, 100) and has_subs:
        return QuestionType.NUMERIC_ALLOCATION, (lo, hi)

    # 6. Multi-select binary (0..1 with sub-cols, one binary per sub-col)
    if (lo, hi) == (0, 1) and has_subs:
        return QuestionType.MULTI_SELECT_BINARY, (lo, hi)

    # 7. Binary two-options (0..1 no sub-cols)
    if (lo, hi) == (0, 1) and not has_subs:
        return QuestionType.BINARY_TWO_OPTIONS, (lo, hi)

    # 8a. Ranking — datamap signals (text OR labels)
    if has_subs and is_ranking:
        return QuestionType.RANKING, (lo, hi)

    # 8b. Grid rated — any other range with sub-cols
    #     (covers Likert 1..N AND Q13-class signed ranges like -50..100)
    if has_subs:
        return QuestionType.GRID_RATED, (lo, hi)

    # 9. Single-select (default for no-sub-cols)
    if not has_subs:
        return QuestionType.SINGLE_SELECT, (lo, hi)

    # Unreachable in practice (cases above are exhaustive for has_subs/lo/hi).
    return QuestionType.UNKNOWN, (lo, hi)