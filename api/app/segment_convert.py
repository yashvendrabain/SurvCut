"""Convert incoming SegmentIn payloads into engine Segment domain objects.

Shared by the export, cuts, and crosscuts routers so the segment shape is built
in exactly one place.
"""
from __future__ import annotations

from typing import Iterable

from cutter_engine import Segment, SegmentCondition, SegmentGroup, SegmentPredicate

from .schemas.responses import SegmentIn


def to_engine_segments(segments: Iterable[SegmentIn]) -> list[Segment]:
    return [
        Segment(
            name=s.name,
            include_others=s.include_others,
            others_label=s.others_label,
            groups=[
                SegmentGroup(
                    name=g.name,
                    conditions_op=g.conditions_op,
                    conditions=[
                        SegmentCondition(
                            column=c.column,
                            predicates_op=c.predicates_op,
                            predicates=[SegmentPredicate(op=p.op, value=p.value)
                                        for p in c.predicates],
                        )
                        for c in g.conditions
                    ],
                )
                for g in s.groups
            ],
        )
        for s in segments
    ]
