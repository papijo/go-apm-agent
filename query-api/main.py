from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db import lifespan
from routers import graph, health, metrics, spans

app = FastAPI(
    title="Observability Query API",
    description="JSON API over the telemetry PostgreSQL store",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

@app.get("/", include_in_schema=False)
async def root() -> dict:
    return {
        "service": "Observability Query API",
        "version": "1.0.0",
        "description": "JSON API over the telemetry PostgreSQL store",
        "endpoints": {
            "health":  "/health",
            "spans":   "/spans",
            "metrics": "/metrics",
            "graph":   "/graph",
            "docs":    "/docs",
        },
    }

app.include_router(health.router, tags=["health"])
app.include_router(spans.router, tags=["spans"])
app.include_router(metrics.router, tags=["metrics"])
app.include_router(graph.router, tags=["graph"])
