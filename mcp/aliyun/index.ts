import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError } from '../../packages/core/shared/utils'

export default createMCPServer({
  name: 'aliyun',
  version: '2.0.0',
  description: '阿里云 toolkit - ECS, OSS, RDS, CDN, Function Compute',
  author: 'MCP Expert Community',
  icon: '☁️'
})
  .addTool({
    name: 'aliyun_ecs_list',
    description: 'List ECS instances',
    parameters: {
      region: { type: 'string', description: 'Region ID', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        region: { type: 'string', required: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      return formatSuccess({
        regions: ['cn-hangzhou', 'cn-shanghai', 'cn-beijing', 'cn-shenzhen'],
        cliCommand: `aliyun ecs DescribeInstances --RegionId ${validation.data.region}`,
        apiEndpoint: `https://ecs.aliyuncs.com/`,
        statusCodes: ['Running', 'Stopped', 'Starting']
      })
    }
  })
  .addTool({
    name: 'aliyun_oss',
    description: 'OSS operations',
    parameters: {
      bucket: { type: 'string', description: 'Bucket name', required: true },
      operation: { type: 'string', description: 'ls|upload|download|sign', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        bucket: { type: 'string', required: true },
        operation: { type: 'string', required: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const commands: Record<string, string> = {
        ls: `aliyun oss ls oss://${validation.data.bucket}`,
        upload: `aliyun oss cp local.file oss://${validation.data.bucket}/`,
        sign: `aliyun oss sign oss://${validation.data.bucket}/file --timeout 3600`
      }

      return formatSuccess({
        command: commands[validation.data.operation] || commands.ls,
        endpoints: ['oss-cn-hangzhou.aliyuncs.com']
      })
    }
  })
  .build()
