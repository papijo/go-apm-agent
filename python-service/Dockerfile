FROM python:3.12-slim
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Detect installed frameworks and install the matching OTel instrumentation libraries
RUN opentelemetry-bootstrap -a install

COPY . .

EXPOSE 8001
CMD ["opentelemetry-instrument", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
