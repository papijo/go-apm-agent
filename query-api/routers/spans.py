from datetime import datetime
from typing import Annotated, Any

import asyncpg
from fastapi import APIRouter, Depends, Query

from db import get_pool
from models import SpanResponse

router = APIRouter()


@router.get("/spans", response_model=list[SpanResponse])
async def list_spans(
    service_name: str | None = Query(None),
    start_time: datetime | None = Query(None),
    end_time: datetime | None = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    pool: Annotated[asyncpg.Pool, Depends(get_pool)] = None,
) -> list[SpanResponse]:
    conditions: list[str] = []
    params: list[Any] = []

    if service_name:
        params.append(service_name)
        conditions.append(f"service_name = ${len(params)}")
    if start_time:
        params.append(start_time)
        conditions.append(f"started_at >= ${len(params)}")
    if end_time:
        params.append(end_time)
        conditions.append(f"started_at <= ${len(params)}")

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    params.append(limit)

    query = f"""
        SELECT id, trace_id, span_id, parent_id, service_name, operation,
               duration_ms, started_at, attributes
        FROM spans
        {where}
        ORDER BY started_at DESC
        LIMIT ${len(params)}
    """

    rows = await pool.fetch(query, *params)
    return [
        SpanResponse(
            id=r["id"],
            trace_id=r["trace_id"],
            span_id=r["span_id"],
            parent_id=r["parent_id"],
            service_name=r["service_name"],
            operation=r["operation"],
            duration_ms=float(r["duration_ms"]) if r["duration_ms"] is not None else None,
            started_at=r["started_at"],
            attributes=r["attributes"] if isinstance(r["attributes"], dict) else {},
        )
        for r in rows
    ]
