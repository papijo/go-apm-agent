'use strict'

// This file must be required before any other import in index.js.
// It bootstraps the OTel SDK which patches Express, http, and other frameworks automatically.
// No manual span creation — the SDK handles everything via auto-instrumentation.

const { NodeSDK } = require('@opentelemetry/sdk-node')
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node')
const { OTLPMetricExporter } = require('@opentelemetry/exporter-metrics-otlp-grpc')
const { PeriodicExportingMetricReader } = require('@opentelemetry/sdk-metrics')

const sdk = new NodeSDK({
  // Trace exporter is configured via environment variables:
  //   OTEL_EXPORTER_OTLP_ENDPOINT  — Go agent gRPC address (e.g. http://agent:4317)
  //   OTEL_EXPORTER_OTLP_PROTOCOL  — grpc
  //   OTEL_SERVICE_NAME            — node-service

  // Metric exporter: gRPC to the same Go agent endpoint, export every 30s
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter(),
    exportIntervalMillis: 30_000,
  }),

  instrumentations: [
    getNodeAutoInstrumentations({
      // Suppress noisy internal instrumentation that creates excessive spans
      '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
  ],
})

sdk.start()

process.on('SIGTERM', () => {
  sdk
    .shutdown()
    .then(() => process.exit(0))
    .catch(() => process.exit(1))
})
