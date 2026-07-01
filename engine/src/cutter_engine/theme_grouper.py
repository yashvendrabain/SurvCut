"""Theme grouper — decides which question goes onto which output sheet.

Phase 1 policy (deterministic):

  - All METADATA questions stay out (no theme).
  - Every analysis-eligible question goes into its Q-ID-range bucket
      (e.g. Q1..Q10 → first group, Q11..Q20 → second, etc.).
  - No auto-Demographics routing. Demographics membership is wizard-driven
      (Phase 2). The classifier's `is_demographic` flag is informational only
      and is NOT used to route questions to a separate sheet.
  - Group naming: prefer a 1-3 word topic mined from the questions; fall back
      to "Theme N".
"""
from __future__ import annotations

import re
from collections import Counter

from .models import QuestionSpec, QuestionType, SurveySchema, ThemeGroup


_QID_NUM_RE = re.compile(r"^[A-Za-z]+(?P<num>\d+)")

STOPWORDS = {
    "the", "a", "an", "of", "to", "for", "and", "or", "in", "is", "are", "was",
    "with", "from", "your", "you", "we", "our", "do", "does", "this", "that",
    "what", "which", "how", "many", "much", "company", "organization",
    "organisation", "best", "describes", "following", "any", "all", "select",
    "rank", "rate", "on", "as", "have", "had", "by", "be", "into",
}


def _block_number(column_id: str) -> int | None:
    m = _QID_NUM_RE.match(column_id)
    if not m:
        return None
    return int(m.group("num"))


def _topic_keyword(questions: list[QuestionSpec]) -> str:
    """Pick a 1-3 word topic from the bag of question_texts (very crude)."""
    tokens: Counter = Counter()
    for q in questions:
        for word in re.findall(r"[A-Za-z]{4,}", q.question_text):
            w = word.lower()
            if w not in STOPWORDS:
                tokens[w] += 1
    if not tokens:
        return ""
    top = tokens.most_common(2)
    return " ".join(w.capitalize() for w, _ in top)


def suggest_themes(schema: SurveySchema, block_size: int = 10) -> list[ThemeGroup]:
    """Return a list of suggested themes for the given schema.

    Phase 1: route every analysis-eligible question into its Q-ID-range bucket.
    The classifier's `is_demographic` flag is NOT used here — Demographics is a
    Phase 2 wizard feature. This avoids the prior behaviour of dumping all
    keyword-matched single-selects into one bloated Demographics sheet.
    """
    other_qs: list[QuestionSpec] = [
        q for q in schema.questions if q.analysis_eligible
    ]

    themes: list[ThemeGroup] = []

    # Group every question by its numeric block
    by_block: dict[int, list[QuestionSpec]] = {}
    leftover: list[QuestionSpec] = []
    for q in other_qs:
        num = _block_number(q.column_id)
        if num is None:
            leftover.append(q)
            continue
        block_idx = (num - 1) // block_size
        by_block.setdefault(block_idx, []).append(q)

    for block_idx in sorted(by_block.keys()):
        questions_in_block = by_block[block_idx]
        topic = _topic_keyword(questions_in_block)
        name = topic or f"Theme {len(themes)}"
        # Numbered themes are also fine — prefix the block range for readability
        first = min(_block_number(q.column_id) or 0 for q in questions_in_block)
        last = max(_block_number(q.column_id) or 0 for q in questions_in_block)
        full_name = f"Q{first}-Q{last} · {name}" if topic else f"Theme {len(themes)}"
        themes.append(ThemeGroup(
            name=full_name[:31],   # Excel sheet name limit
            question_column_ids=[q.column_id for q in questions_in_block],
        ))

    if leftover:
        themes.append(ThemeGroup(
            name="Other",
            question_column_ids=[q.column_id for q in leftover],
        ))
    return themes


def validate_theme_assignment(
    themes: list[ThemeGroup], schema: SurveySchema
) -> tuple[list[str], list[str]]:
    """Return (warnings, errors) about the proposed assignment.

    Checks every analysis-eligible question is assigned exactly once, and that
    no theme is empty.
    """
    declared = {qid: 0 for q in schema.questions if q.analysis_eligible
                for qid in [q.column_id]}
    seen_ids: set[str] = set()
    warnings: list[str] = []
    errors: list[str] = []
    for t in themes:
        if not t.question_column_ids:
            warnings.append(f"Theme {t.name!r} is empty")
        for qid in t.question_column_ids:
            if qid not in declared:
                warnings.append(f"Theme {t.name!r} references unknown / ineligible question {qid!r}")
            if qid in seen_ids:
                warnings.append(f"Question {qid!r} appears in multiple themes")
            seen_ids.add(qid)
    missing = set(declared) - seen_ids
    for qid in missing:
        warnings.append(f"Question {qid!r} is not assigned to any theme")
    return warnings, errors
