import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError } from '../../packages/core/shared/utils'

export default createMCPServer({
  name: 'aws-dev',
  version: '2.0.0',
  description: 'AWS CDK & SAM development toolkit - infrastructure as code',
  author: 'MCP Expert Community',
  icon: '🏗️'
})
  .addTool({
    name: 'awscdk_init',
    description: 'Initialize CDK project',
    parameters: {
      language: { type: 'string', description: 'typescript|python|java', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        language: { type: 'string', required: false, default: 'typescript' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      return formatSuccess({
        initCommand: `cdk init app --language ${validation.data.language}`,
        deployCommand: 'cdk deploy',
        diffCommand: 'cdk diff',
        synthCommand: 'cdk synth'
      })
    }
  })
  .addTool({
    name: 'awscdk_stack',
    description: 'Generate CDK stack template',
    parameters: {
      name: { type: 'string', description: 'Stack name', required: true },
      services: { type: 'string', description: 'lambda,apigateway,dynamodb', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        name: { type: 'string', required: true },
        services: { type: 'string', required: false, default: 'lambda' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      return formatSuccess({
        imports: [
          'import * as cdk from aws-cdk-lib',
          'import * as lambda from aws-cdk-lib/aws-lambda',
          'import * as apigw from aws-cdk-lib/aws-apigateway'
        ],
        services: validation.data.services.split(','),
        boilerplate: `export class ${validation.data.name}Stack extends cdk.Stack { constructor(scope, id, props) { super(scope, id, props); }}`
      })
    }
  })
  .build()
