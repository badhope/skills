import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError } from '../../packages/core/shared/utils'

export default createMCPServer({
  name: 'observability-mq',
  version: '2.0.0',
  description: 'Observability & Message Queue toolkit - Prometheus, Grafana, Loki, RabbitMQ, Kafka',
  author: 'MCP Expert Community',
  icon: '📊'
})
  .addTool({
    name: 'prom_query',
    description: 'Prometheus query builder',
    parameters: {
      metric: { type: 'string', description: 'Metric name', required: true },
      range: { type: 'string', description: 'Time range', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        metric: { type: 'string', required: true },
        range: { type: 'string', required: false, default: '5m' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      return formatSuccess({
        queries: {
          rate: `rate(${validation.data.metric}[${validation.data.range}])`,
          sum: `sum by (instance) (rate(${validation.data.metric}[${validation.data.range}]))`,
          histogram: `histogram_quantile(0.95, sum by (le) (rate(${validation.data.metric}_bucket[${validation.data.range}]))`
        },
        apiEndpoint: 'http://prometheus:9090/api/v1/query'
      })
    }
  })
  .addTool({
    name: 'grafana_panel',
    description: 'Generate Grafana panel JSON',
    parameters: {
      title: { type: 'string', description: 'Panel title', required: true },
      type: { type: 'string', description: 'graph|stat|table', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        title: { type: 'string', required: true },
        type: { type: 'string', required: false, default: 'graph' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      return formatSuccess({
        datasource: 'Prometheus',
        panelType: validation.data.type,
        gridPos: { h: 8, w: 12 },
        targets: [{ expr: 'rate(http_requests_total[5m])' }]
      })
    }
  })
  .addTool({
    name: 'kafka_ops',
    description: 'Kafka operations',
    parameters: {
      operation: { type: 'string', description: 'list-topics|create-topic|produce|consume', required: true },
      topic: { type: 'string', description: 'Topic name', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        operation: { type: 'string', required: true },
        topic: { type: 'string', required: false, default: 'default-topic' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const commands: Record<string, string> = {
        'list-topics': 'kafka-topics.sh --list --bootstrap-server localhost:9092',
        'create-topic': `kafka-topics.sh --create --topic ${validation.data.topic}`,
        'consume': `kafka-console-consumer.sh --topic ${validation.data.topic} --from-beginning`
      }

      return formatSuccess({
        command: commands[validation.data.operation] || commands['list-topics'],
        brokers: ['localhost:9092']
      })
    }
  })
  .build()
