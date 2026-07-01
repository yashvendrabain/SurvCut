"""Phase 1 smoke test — runs the sample file through parse → validate → classify."""
from __future__ import annotations

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import pandas as pd

from core.classifier import classify, summarise
from core.datamap_parser import parse_datamap
from core.validator import validate, format_report


_ORIGINAL_SAMPLE = (
    HERE.parent
    / "Survey cutter automation"
    / "Survey insight engine runnable"
    / "docs"
    / "sample_datamap_and_rawdata.xlsx"
)


def _readable_sample_path() -> Path:
    """Return a path we can actually read.

    Strategy:
      1. Try shutil.copy from OneDrive → %TEMP% (fails if Excel has the file open).
      2. Else fall back to an existing %TEMP% copy (e.g. one PowerShell made earlier).
      3. Else use the original path directly (will fail later with a clear error).
    """
    import shutil
    import tempfile
    tmp = Path(tempfile.gettempdir()) / "sample_dm_copy.xlsx"
    try:
        shutil.copy(_ORIGINAL_SAMPLE, tmp)
        return tmp
    except (PermissionError, OSError):
        if tmp.exists():
            print(f"  (using pre-existing temp copy at {tmp})")
            return tmp
        print(f"  WARN: could not copy or find a usable sample. "
              f"Close Excel if it has the file open, or copy it manually to {tmp}.")
        return _ORIGINAL_SAMPLE


SAMPLE = _readable_sample_path()


def section(t: str) -> None:
    print(f"\n{'=' * 70}\n{t}\n{'=' * 70}")


def main() -> None:
    print(f"Sample file: {SAMPLE}")
    if not SAMPLE.exists():
        print("FILE NOT FOUND")
        return

    section("STAGE 1 — Parse datamap")
    blocks = parse_datamap(SAMPLE)
    print(f"  Parsed {len(blocks)} blocks.")
    for b in blocks:
        sub = f", {len(b.sub_columns)} sub-cols" if b.sub_columns else ""
        opts = f", {len(b.scale_options)} options" if b.scale_options else ""
        print(f"  R{b.source_row_in_datamap:>4}  [{b.column_id}]  type_hint={b.type_hint!r}{opts}{sub}")
        for w in b.warnings:
            print(f"        WARN: {w}")

    section("STAGE 2 — Load raw data")
    raw_df = pd.read_excel(SAMPLE, sheet_name="Raw data")
    print(f"  Raw shape: {raw_df.shape}")
    print(f"  First 5 column headers: {list(raw_df.columns[:5])}")
    print(f"  Last 5 column headers:  {list(raw_df.columns[-5:])}")

    section("STAGE 3 — Validate raw vs datamap")
    report = validate(blocks, raw_df)
    print(format_report(report))

    section("STAGE 4 — Classify")
    schema = classify(blocks, raw_df)
    print(summarise(schema))

    section("STAGE 5 — Per-question breakdown")
    for q in schema.questions:
        eligible = "" if q.analysis_eligible else f"  [excluded: {q.exclusion_reason}]"
        demo = "  [demo]" if q.is_demographic else ""
        print(f"  {q.column_id:<25} {q.question_type.value:<22} "
              f"raw_cols={len(q.raw_columns):>2}  opts={len(q.option_map):>2}{demo}{eligible}")

    section("DONE")


if __name__ == "__main__":
    main()
