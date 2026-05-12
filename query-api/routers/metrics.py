from typing import Annotated, Any

import asyncpg
from fastapi import APIRouter, Depends, Query

from db import get_pool
from models import MetricResponse

router = APIRouter()


@router.get("/metrics", response_model=list[MetricResponse])
async def list_metrics(
    service_name: str | None = Query(None),
    metric_name: str | None = Query(None),
    limit: int = Query(100, ge=1, le=1000),
    pool: Annotated[asyncpg.Pool, Depends(get_pool)] = None,
) -> list[MetricResponse]:
    conditions: list[str] = []
    params: list[Any] = []

    if service_name:
        params.append(service_name)
        conditions.append(f"service_name = ${len(params)}")
    if metric_name:
        params.append(metric_name)
        conditions.append(f"metric_name = ${len(params)}")

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    params.append(limit)

    # DISTINCT ON (service_name, metric_name) returns the latest value per metric per service
    query = f"""
        SELECT DISTINCT ON (service_name, metric_name)
               id, service_name, metric_name, value, unit, recorded_at
        FROM metrics
        {where}
        ORDER BY service_name, metric_name, recorded_at DESC
        LIMIT ${len(params)}
    """

    rows = await pool.fetch(query, *params)
    return [
        MetricResponse(
            id=r["id"],
            service_name=r["service_name"],
            metric_name=r["metric_name"],
            value=r["value"],
            unit=r["unit"],
            recorded_at=r["recorded_at"],
        )
        for r in rows
    ]
