from typing import Annotated

import asyncpg
from fastapi import APIRouter, Depends

from db import get_pool
from models import GraphEdge, GraphResponse

router = APIRouter()


@router.get("/graph", response_model=GraphResponse)
async def dependency_graph(
    pool: Annotated[asyncpg.Pool, Depends(get_pool)] = None,
) -> GraphResponse:
    """
    B2: Build service dependency graph from parent_id joins.
    A call edge exists when a child span's parent span belongs to a different service.
    """
    rows = await pool.fetch(
        """
        SELECT
            parent_span.service_name AS caller,
            child_span.service_name  AS callee,
            COUNT(*)                 AS call_count
        FROM spans AS child_span
        JOIN spans AS parent_span
          ON child_span.parent_id = parent_span.span_id
         AND child_span.service_name != parent_span.service_name
        GROUP BY caller, callee
        ORDER BY call_count DESC
        """
    )

    edges = [
        GraphEdge(caller=r["caller"], callee=r["callee"], call_count=r["call_count"])
        for r in rows
    ]

    nodes_set: set[str] = set()
    for e in edges:
        nodes_set.add(e.caller)
        nodes_set.add(e.callee)

    # Also include services that have spans but no cross-service calls
    solo_rows = await pool.fetch(
        "SELECT DISTINCT service_name FROM spans"
    )
    for r in solo_rows:
        nodes_set.add(r["service_name"])

    return GraphResponse(nodes=sorted(nodes_set), edges=edges)
