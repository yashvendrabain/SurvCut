"""Pydantic response models for the API."""
from __future__ import annotations

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str


class UploadResponse(BaseModel):
    session_id: str
    n_respondents: int
    n_raw_columns: int
    n_datamap_blocks: int
    n_eligible_questions: int
    validation_errors: list[str]
    validation_warnings: list[str]


class QuestionSummary(BaseModel):
    column_id: str
    question_text: str
    question_type: str
    n_options: int
    n_sub_columns: int
    is_demographic: bool
    analysis_eligible: bool


class SchemaResponse(BaseModel):
    total_questions: int
    analysis_eligible: int
    total_respondents: int
    questions: list[QuestionSummary]


class CrossCutRequest(BaseModel):
    session_id: str
    row_qid: str
    col_qid: str


class CrossCutResponse(BaseModel):
    row_labels: list[str]
    col_labels: list[str]
    counts: list[list[float]]
    warnings: list[str]


class QueuedCrossCut(BaseModel):
    row_qid: str
    col_qid: str


class BuildRequest(BaseModel):
    session_id: str
    theme_names: list[str]
    theme_question_ids: list[list[str]]
    filter_column_ids: list[str]
    queued_cross_cuts: list[QueuedCrossCut] = []


class BuildResponse(BaseModel):
    workbook_path: str
    size_bytes: int