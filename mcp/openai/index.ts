import { createMCPServer } from '../../packages/core/mcp/builder'
import { validateParams, formatSuccess, formatError } from '../../packages/core/shared/utils'

export default createMCPServer({
  name: 'openai',
  version: '2.0.0',
  description: 'OpenAI toolkit - completions, embeddings, fine-tuning, function calling',
  author: 'MCP Expert Community',
  icon: '🤖'
})
  .addTool({
    name: 'openai_chat',
    description: 'Generate chat completion parameters',
    parameters: {
      prompt: { type: 'string', description: 'User prompt', required: true },
      model: { type: 'string', description: 'Model name', required: false },
      temperature: { type: 'number', description: 'Temperature 0-2', required: false },
      system: { type: 'string', description: 'System prompt', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        prompt: { type: 'string', required: true },
        model: { type: 'string', required: false, default: 'gpt-4-turbo' },
        temperature: { type: 'number', required: false, default: 0.7 },
        system: { type: 'string', required: false, default: 'You are a helpful assistant.' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      return formatSuccess({
        apiEndpoint: 'https://api.openai.com/v1/chat/completions',
        payload: {
          model: validation.data.model,
          temperature: validation.data.temperature,
          messages: [
            { role: 'system', content: validation.data.system },
            { role: 'user', content: validation.data.prompt }
          ]
        },
        models: ['gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo'],
        curlExample: `curl https://api.openai.com/v1/chat/completions -H "Authorization: Bearer $OPENAI_API_KEY"`
      })
    }
  })
  .addTool({
    name: 'openai_embeddings',
    description: 'Generate embeddings parameters',
    parameters: {
      input: { type: 'string', description: 'Text to embed', required: true },
      model: { type: 'string', description: 'Embedding model', required: false }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        input: { type: 'string', required: true },
        model: { type: 'string', required: false, default: 'text-embedding-3-large' }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      return formatSuccess({
        apiEndpoint: 'https://api.openai.com/v1/embeddings',
        models: ['text-embedding-3-large', 'text-embedding-3-small', 'text-embedding-ada-002'],
        dimensions: { large: 3072, small: 1536 }
      })
    }
  })
  .addTool({
    name: 'openai_function',
    description: 'Generate function calling schema',
    parameters: {
      name: { type: 'string', description: 'Function name', required: true },
      description: { type: 'string', description: 'Function description', required: true },
      parameters: { type: 'string', description: 'JSON schema parameters', required: true }
    },
    execute: async (params: Record<string, any>) => {
      const validation = validateParams(params, {
        name: { type: 'string', required: true },
        description: { type: 'string', required: true },
        parameters: { type: 'string', required: true }
      })
      if (!validation.valid) return formatError('Invalid parameters', validation.errors)

      return formatSuccess({
        functionSchema: {
          type: 'function',
          function: {
            name: validation.data.name,
            description: validation.data.description,
            parameters: JSON.parse(validation.data.parameters)
          }
        },
        example: `tools: [{ type: "function", function: {...}}]`
      })
    }
  })
  .build()
