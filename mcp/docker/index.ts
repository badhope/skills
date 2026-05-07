import { createMCPServer } from '../../packages/core/mcp/builder'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

async function safeExec(cmd: string): Promise<string> {
  try { const { stdout } = await execAsync(cmd, { timeout: 60000 }); return stdout.trim() }
  catch (e: any) { return e.stdout || e.stderr || e.message }
}

export default createMCPServer({
  name: 'docker',
  version: '1.0.0',
  description: 'Docker toolkit - Manage containers, images, volumes, networks, and compose stacks',
  icon: '🐳',
  author: 'MCP Expert Community'
})
  .addTool({
    name: 'docker_version',
    description: 'Check Docker version and system info',
    parameters: {},
    execute: async () => {
      const version = await safeExec('docker version --format json 2>&1')
      const info = await safeExec('docker info --format json 2>&1')
      try {
        return {
          version: JSON.parse(version),
          info: JSON.parse(info)
        }
      } catch {
        return { version, info }
      }
    }
  })
  .addTool({
    name: 'docker_ps',
    description: 'List running and stopped containers',
    parameters: {
      all: { type: 'boolean', description: 'Show all containers including stopped' },
      format: { type: 'string', description: 'Output format' }
    },
    execute: async (params: any) => {
      const allFlag = params.all ? '-a' : ''
      const result = await safeExec(`docker ps ${allFlag} --format "{{json .}}" 2>&1`)
      try {
        const containers = result.split('\n').filter(l => l).map(l => JSON.parse(l))
        return {
          count: containers.length,
          containers
        }
      } catch {
        return { raw: result }
      }
    }
  })
  .addTool({
    name: 'docker_run',
    description: 'Run a new container from image',
    parameters: {
      image: { type: 'string', description: 'Docker image name:tag' },
      name: { type: 'string', description: 'Container name' },
      ports: { type: 'string', description: 'Port mappings: -p 8080:80 format' },
      env: { type: 'string', description: 'Environment vars: -e KEY=value format' },
      volumes: { type: 'string', description: 'Volume mounts: -v /host:/container format' },
      detach: { type: 'boolean', description: 'Run in detached mode' },
      command: { type: 'string', description: 'Command to run in container' }
    },
    execute: async (params: any) => {
      const name = params.name ? `--name ${params.name}` : ''
      const detach = params.detach ? '-d' : ''
      const result = await safeExec(`docker run ${detach} ${name} ${params.ports || ''} ${paramsDELETE || ''} ${params.volumes || ''} ${params.image} ${params.command || ''} 2>&1`)
      return {
        image: params.image,
        containerId: result.trim(),
        output: result
      }
    }
  })
  .addTool({
    name: 'docker_exec',
    description: 'Execute command inside running container',
    parameters: {
      container: { type: 'string', description: 'Container name or ID' },
      command: { type: 'string', description: 'Command to execute' },
      interactive: { type: 'boolean', description: 'Interactive mode' }
    },
    execute: async (params: any) => {
      const it = params.interactive ? '-it' : ''
      const result = await safeExec(`docker exec ${it} ${params.container} ${params.command} 2>&1`)
      return {
        container: params.container,
        output: result
      }
    }
  })
  .addTool({
    name: 'docker_logs',
    description: 'View container logs',
    parameters: {
      container: { type: 'string', description: 'Container name or ID' },
      follow: { type: 'boolean', description: 'Follow log output' },
      tail: { type: 'number', description: 'Number of lines to show from end' },
      since: { type: 'string', description: 'Show logs since timestamp' }
    },
    execute: async (params: any) => {
      const tail = params.tail ? `--tail ${params.tail}` : '--tail 100'
      const result = await safeExec(`docker logs ${tail} ${params.since ? `--since ${params.since}` : ''} ${params.container} 2>&1`)
      return {
        container: params.container,
        logs: result.substring(0, 10000)
      }
    }
  })
  .addTool({
    name: 'docker_stop_start',
    description: 'Stop, start, or restart a container',
    parameters: {
      container: { type: 'string', description: 'Container name or ID' },
      action: { type: 'string', description: 'Action: stop, start, restart, kill, rm' }
    },
    execute: async (params: any) => {
      const result = await safeExec(`docker ${params.action || 'stop'} ${params.container} 2>&1`)
      return {
        container: params.container,
        action: params.action,
        result
      }
    }
  })
  .addTool({
    name: 'docker_images',
    description: 'List local Docker images',
    parameters: {
      filter: { type: 'string', description: 'Filter images by name' }
    },
    execute: async (params: any) => {
      const result = await safeExec(`docker images --format "{{json .}}" ${params.filter || ''} 2>&1`)
      try {
        const images = result.split('\n').filter(l => l).map(l => JSON.parse(l))
        return { count: images.length, images }
      } catch {
        return { raw: result }
      }
    }
  })
  .addTool({
    name: 'docker_pull',
    description: 'Pull image from registry',
    parameters: {
      image: { type: 'string', description: 'Image name:tag to pull' }
    },
    execute: async (params: any) => {
      const result = await safeExec(`docker pull ${params.image} 2>&1`)
      return { image: params.image, result }
    }
  })
  .addTool({
    name: 'docker_build',
    description: 'Build Docker image from Dockerfile',
    parameters: {
      tag: { type: 'string', description: 'Image name:tag' },
      path: { type: 'string', description: 'Build context path' },
      file: { type: 'string', description: 'Dockerfile path' },
      buildArgs: { type: 'string', description: '--build-arg KEY=value format' },
      noCache: { type: 'boolean', description: 'Do not use cache' }
    },
    execute: async (params: any) => {
      const path = params.path || '.'
      const file = params.file ? `-f ${params.file}` : ''
      const noCache = params.noCache ? '--no-cache' : ''
      const result = await safeExec(`docker build -t ${params.tag} ${file} ${noCache} ${params.buildArgs || ''} ${path} 2>&1`)
      return { tag: params.tag, path, result }
    }
  })
  .addTool({
    name: 'docker_compose',
    description: 'Manage Docker Compose stacks',
    parameters: {
      file: { type: 'string', description: 'Compose file path' },
      action: { type: 'string', description: 'Action: up, down, ps, logs, restart, stop' },
      services: { type: 'string', description: 'Specific service names' },
      detach: { type: 'boolean', description: 'Run in detached mode' }
    },
    execute: async (params: any) => {
      const file = params.file ? `-f ${params.file}` : ''
      const detach = params.detach ? '-d' : ''
      const result = await safeExec(`docker compose ${file} ${params.action} ${detach} ${params.services || ''} 2>&1`)
      return {
        action: params.action,
        file: params.file || 'docker-compose.yml',
        result
      }
    }
  })
  .addTool({
    name: 'docker_stats',
    description: 'Show container resource usage statistics',
    parameters: {
      container: { type: 'string', description: 'Specific container name/ID' },
      noStream: { type: 'boolean', description: 'Disable streaming' }
    },
    execute: async (params: any) => {
      const result = await safeExec(`docker stats --no-stream --format "{{json .}}" ${params.container || ''} 2>&1`)
      try {
        const stats = result.split('\n').filter(l => l).map(l => JSON.parse(l))
        return { stats }
      } catch {
        return { raw: result }
      }
    }
  })
  .addTool({
    name: 'docker_volumes',
    description: 'Manage Docker volumes',
    parameters: {
      action: { type: 'string', description: 'Action: ls, inspect, create, rm, prune' },
      name: { type: 'string', description: 'Volume name' }
    },
    execute: async (params: any) => {
      const action = params.action || 'ls'
      const result = await safeExec(`docker volume ${action} ${params.name || ''} 2>&1`)
      return { action, name: params.name, result }
    }
  })
  .build()
