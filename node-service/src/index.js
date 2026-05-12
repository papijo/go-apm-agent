'use strict'

// tracing.js must be required first — it patches Express before it is loaded
require('./tracing')

const express = require('express')
const http = require('http')

const app = express()
const PORT = process.env.PORT || 3000

app.get('/', (req, res) => {
  res.json({ service: 'node-service', status: 'ok' })
})

app.get('/ping', (req, res) => {
  res.json({ pong: true })
})

app.get('/health', (req, res) => {
  res.json({ status: 'healthy' })
})

app.get('/work', async (req, res) => {
  await new Promise((resolve) => setTimeout(resolve, 20))
  res.json({ result: 'done' })
})

// B2: calls python-service so OTel propagates trace context across service boundaries,
// creating a cross-service parent-child span relationship visible in GET /graph.
app.get('/upstream', (req, res) => {
  const options = {
    hostname: process.env.PYTHON_SERVICE_HOST || 'python-service',
    port: 8001,
    path: '/work',
    method: 'GET',
  }
  const proxyReq = http.request(options, (proxyRes) => {
    let body = ''
    proxyRes.on('data', (chunk) => { body += chunk })
    proxyRes.on('end', () => {
      res.json({ caller: 'node-service', callee: 'python-service', result: JSON.parse(body) })
    })
  })
  proxyReq.on('error', (err) => res.status(502).json({ error: err.message }))
  proxyReq.end()
})

app.listen(PORT, () => {
  console.log(`node-service listening on port ${PORT}`)
})
