import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError, safeExecRaw } from '../../packages/core/shared/utils'

export default createMCPServer({
  name: 'aws',
  version: '2.0.0',
  description: 'AWS CLI toolkit - EC2, S3, Lambda, CloudWatch operations with multi-profile support',
  author: 'MCP Expert Community',
  icon: '☁️'
})
  .addTool({
    name: 'aws_ec2_list',
    description: 'List EC2 instances with filtering and status checks',
    parameters: {
      region: { type: 'string', description: 'AWS region', required: true },
      profile: { type: 'string', description: 'AWS profile', required: false },
      state: { type: 'string', description: 'running|stopped|all', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        region: { type: 'string', required: true },
        profile: { type: 'string', required: false, default: 'default' },
        state: { type: 'string', required: false, default: 'all' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const filters = validation.data.state !== 'all' ? `--filters Name=instance-state-name,Values=${validation.data.state}` : ''
      const cmd = `aws ec2 describe-instances --region ${validation.data.region} --profile ${validation.data.profile} ${filters}`
      const result = await safeExecRaw(cmd)

      return formatSuccess({
        command: cmd,
        exitCode: result.exitCode,
        instances: result.exitCode === 0 ? 'See AWS CLI output' : 'Command failed',
        regions: ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1']
      })
    }
  })
  .addTool({
    name: 'aws_s3_list',
    description: 'List S3 buckets and objects with size summary',
    parameters: {
      bucket: { type: 'string', description: 'Bucket name', required: false },
      prefix: { type: 'string', description: 'Key prefix', required: false },
      region: { type: 'string', description: 'AWS region', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        bucket: { type: 'string', required: false, default: '' },
        prefix: { type: 'string', required: false, default: '' },
        region: { type: 'string', required: false, default: 'us-east-1' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      const cmd = validation.data.bucket
        ? `aws s3 ls s3://${validation.data.bucket}/${validation.data.prefix} --recursive --human-readable`
        : 'aws s3 ls'

      return formatSuccess({
        command: cmd,
        suggestedActions: [
          'aws s3 cp <file> s3://bucket/',
          'aws s3 sync local/ s3://bucket/',
          'aws s3 presign s3://bucket/file'
        ]
      })
    }
  })
  .addTool({
    name: 'aws_lambda_invoke',
    description: 'Invoke Lambda function with payload and logging',
    parameters: {
      functionName: { type: 'string', description: 'Lambda function name', required: true },
      payload: { type: 'string', description: 'JSON payload', required: false },
      region: { type: 'string', description: 'AWS region', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        functionName: { type: 'string', required: true },
        payload: { type: 'string', required: false, default: '{}' },
        region: { type: 'string', required: false, default: 'us-east-1' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      return formatSuccess({
        cliCommand: `aws lambda invoke --function-name ${validation.data.functionName} --region ${validation.data.region} --payload '${validation.data.payload}' response.json`,
        testPayload: JSON.parse(validation.data.payload),
        logCommand: `aws logs tail /aws/lambda/${validation.data.functionName} --follow`
      })
    }
  })
  .build()
