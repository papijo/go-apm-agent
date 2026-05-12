from datetime import datetime
from typing import Any

from pydantic import BaseModel


class SpanResponse(BaseModel):
    id: int
    trace_id: str
    span_id: str
    parent_id: str | None
    service_name: str
    operation: str
    duration_ms: float | None
    started_at: datetime
    attributes: dict[str, Any]


class MetricResponse(BaseModel):
    id: int
    service_name: str
    metric_name: str
    value: float
    unit: str | None
    recorded_at: datetime


class GraphEdge(BaseModel):
    caller: str
    callee: str
    call_count: int


class GraphResponse(BaseModel):
    nodes: list[str]
    edges: list[GraphEdge]


class HealthResponse(BaseModel):
    status: str
