import asyncio

from fastapi import FastAPI

# No OTel imports — instrumentation is injected at runtime by opentelemetry-instrument CLI.
# The SDK patches FastAPI/Starlette/ASGI before this code runs.

app = FastAPI(title="python-service")


@app.get("/")
def root():
    return {"service": "python-service", "status": "ok"}


@app.get("/ping")
def ping():
    return {"pong": True}


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.get("/work")
async def work():
    # Small async delay so spans have measurable duration
    await asyncio.sleep(0.02)
    return {"result": "done"}
