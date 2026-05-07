import { createMCPServer } from '../../packages/core/mcp/builder'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

async function safeExec(cmd: string): Promise<string> {
  try { const { stdout } = await execAsync(cmd, { timeout: 60000 }); return stdout.trim() }
  catch (e: any) { return e.stdout || e.stderr || e.message }
}

export default createMCPServer({
  name: 'kubernetes',
  version: '1.0.0',
  description: 'Kubernetes toolkit - Manage pods, deployments, services, configmaps, and cluster resources',
  icon: '☸️',
  author: 'MCP Expert Community'
})
  .addTool({
    name: 'k8s_set_kubeconfig',
    description: 'Set kubeconfig path or context',
    parameters: {
      kubeconfig: { type: 'string', description: 'Path to kubeconfig file' },
      context: { type: 'string', description: 'Context name to use' }
    },
    execute: async (params: any) => {
      if (params.kubeconfig) {
        processDELETE.KUBECONFIG = params.kubeconfig
      }
      if (params.context) {
        await safeExec(`kubectl config use-context ${params.context} 2>&1`)
      }
      const current = await safeExec('kubectl config current-context 2>&1')
      return {
        kubeconfig: params.kubeconfig || processDELETE.KUBECONFIG,
        currentContext: current,
        message: 'Kubernetes configuration updated'
      }
    }
  })
  .addTool({
    name: 'k8s_cluster_info',
    description: 'Get cluster information and version',
    parameters: {},
    execute: async () => {
      const version = await safeExec('kubectl version --output json 2>&1')
      const nodes = await safeExec('kubectl get nodes -o json 2>&1')
      try {
        return {
          version: JSON.parse(version),
          nodes: JSON.parse(nodes).items?.map((n: any) => ({
            name: n.metadata.name,
            status: n.status.conditions?.find((c: any) => c.type === 'Ready')?.status,
            roles: n.metadata.labels?.['node-role.kubernetes.io/control-plane'] ? 'control-plane' : 'worker',
            version: n.status.nodeInfo.kubeletVersion,
            ip: n.status.addresses?.find((a: any) => a.type === 'InternalIP')?.address
          }))
        }
      } catch {
        return { version, nodes: nodes.substring(0, 2000) }
      }
    }
  })
  .addTool({
    name: 'k8s_get_pods',
    description: 'List pods in namespace',
    parameters: {
      namespace: { type: 'string', description: 'Namespace name' },
      allNamespaces: { type: 'boolean', description: 'List across all namespaces' },
      selector: { type: 'string', description: 'Label selector (e.g., app=myapp)' },
      output: { type: 'string', description: 'Output format: wide, json, yaml' }
    },
    execute: async (params: any) => {
      const ns = params.allNamespaces ? '-A' : (params.namespace ? `-n ${params.namespace}` : '')
      const selector = params.selector ? `-l ${params.selector}` : ''
      const output = params.output ? `-o ${params.output}` : ''
      const result = await safeExec(`kubectl get pods ${ns} ${selector} ${output} 2>&1`)
      return { result }
    }
  })
  .addTool({
    name: 'k8s_get_deployments',
    description: 'List deployments in namespace',
    parameters: {
      namespace: { type: 'string', description: 'Namespace name' },
      allNamespaces: { type: 'boolean', description: 'List across all namespaces' },
      selector: { type: 'string', description: 'Label selector' }
    },
    execute: async (params: any) => {
      const ns = params.allNamespaces ? '-A' : (params.namespace ? `-n ${params.namespace}` : '')
      const selector = params.selector ? `-l ${params.selector}` : ''
      const result = await safeExec(`kubectl get deployments ${ns} ${selector} -o wide 2>&1`)
      return { result }
    }
  })
  .addTool({
    name: 'k8s_describe',
    description: 'Describe detailed information about a resource',
    parameters: {
      resource: { type: 'string', description: 'Resource type: pod, deployment, service, etc.' },
      name: { type: 'string', description: 'Resource name' },
      namespace: { type: 'string', description: 'Namespace name' }
    },
    execute: async (params: any) => {
      const ns = params.namespace ? `-n ${params.namespace}` : ''
      const result = await safeExec(`kubectl describe ${params.resource} ${params.name} ${ns} 2>&1`)
      return {
        resource: params.resource,
        name: params.name,
        result: result.substring(0, 15000)
      }
    }
  })
  .addTool({
    name: 'k8s_logs',
    description: 'Get logs from a pod',
    parameters: {
      pod: { type: 'string', description: 'Pod name' },
      container: { type: 'string', description: 'Container name (for multi-container pods)' },
      namespace: { type: 'string', description: 'Namespace name' },
      follow: { type: 'boolean', description: 'Follow log output' },
      tail: { type: 'number', description: 'Number of lines to show from end' },
      since: { type: 'string', description: 'Show logs since time (e.g., 1h, 24h)' }
    },
    execute: async (params: any) => {
      const ns = params.namespace ? `-n ${params.namespace}` : ''
      const container = params.container ? `-c ${params.container}` : ''
      const tail = params.tail ? `--tail=${params.tail}` : '--tail=200'
      const since = params.since ? `--since=${params.since}` : ''
      const result = await safeExec(`kubectl logs ${params.pod} ${ns} ${container} ${tail} ${since} 2>&1`)
      return {
        pod: params.pod,
        container: params.container,
        namespace: params.namespace || 'default',
        logs: result.substring(0, 15000)
      }
    }
  })
  .addTool({
    name: 'k8s_apply',
    description: 'Apply configuration from file or stdin',
    parameters: {
      filename: { type: 'string', description: 'Path to YAML/JSON file' },
      yaml: { type: 'string', description: 'YAML content as string' },
      namespace: { type: 'string', description: 'Namespace name' }
    },
    execute: async (params: any) => {
      const ns = params.namespace ? `-n ${params.namespace}` : ''
      if (params.yaml) {
        const result = await safeExec(`echo '${params.yaml.replace(/'/g, "'\\''")}' | kubectl apply -f - ${ns} 2>&1`)
        return { result }
      }
      const result = await safeExec(`kubectl apply -f ${params.filename} ${ns} 2>&1`)
      return { filename: params.filename, result }
    }
  })
  .addTool({
    name: 'k8s_delete',
    description: 'Delete a resource',
    parameters: {
      resource: { type: 'string', description: 'Resource type' },
      name: { type: 'string', description: 'Resource name' },
      namespace: { type: 'string', description: 'Namespace name' },
      force: { type: 'boolean', description: 'Force deletion immediately' }
    },
    execute: async (params: any) => {
      const ns = params.namespace ? `-n ${params.namespace}` : ''
      const force = params.force ? '--force --grace-period=0' : ''
      const result = await safeExec(`kubectl delete ${params.resource} ${params.name} ${ns} ${force} 2>&1`)
      return {
        resource: params.resource,
        name: params.name,
        result
      }
    }
  })
  .addTool({
    name: 'k8s_exec',
    description: 'Execute command inside a pod container',
    parameters: {
      pod: { type: 'string', description: 'Pod name' },
      command: { type: 'string', description: 'Command to execute' },
      container: { type: 'string', description: 'Container name' },
      namespace: { type: 'string', description: 'Namespace name' },
      interactive: { type: 'boolean', description: 'Interactive mode' }
    },
    execute: async (params: any) => {
      const ns = params.namespace ? `-n ${params.namespace}` : ''
      const container = params.container ? `-c ${params.container}` : ''
      const it = params.interactive ? '-it' : ''
      const result = await safeExec(`kubectl exec ${it} ${params.pod} ${ns} ${container} -- ${params.command} 2>&1`)
      return {
        pod: params.pod,
        command: params.command,
        output: result
      }
    }
  })
  .addTool({
    name: 'k8s_scale',
    description: 'Scale deployment replicas',
    parameters: {
      deployment: { type: 'string', description: 'Deployment name' },
      replicas: { type: 'number', description: 'Number of replicas' },
      namespace: { type: 'string', description: 'Namespace name' }
    },
    execute: async (params: any) => {
      const ns = params.namespace ? `-n ${params.namespace}` : ''
      const result = await safeExec(`kubectl scale deployment ${params.deployment} --replicas=${params.replicas} ${ns} 2>&1`)
      return {
        deployment: params.deployment,
        replicas: params.replicas,
        result
      }
    }
  })
  .addTool({
    name: 'k8s_get_services',
    description: 'List services in namespace',
    parameters: {
      namespace: { type: 'string', description: 'Namespace name' },
      allNamespaces: { type: 'boolean', description: 'List across all namespaces' }
    },
    execute: async (params: any) => {
      const ns = params.allNamespaces ? '-A' : (params.namespace ? `-n ${params.namespace}` : '')
      const result = await safeExec(`kubectl get svc ${ns} -o wide 2>&1`)
      return { result }
    }
  })
  .addTool({
    name: 'k8s_get_configmaps',
    description: 'List ConfigMaps',
    parameters: {
      namespace: { type: 'string', description: 'Namespace name' },
      name: { type: 'string', description: 'Specific ConfigMap name to view' }
    },
    execute: async (params: any) => {
      const ns = params.namespace ? `-n ${params.namespace}` : ''
      if (params.name) {
        const result = await safeExec(`kubectl get configmap ${params.name} ${ns} -o yaml 2>&1`)
        return { result }
      }
      const result = await safeExec(`kubectl get configmaps ${ns} 2>&1`)
      return { result }
    }
  })
  .addTool({
    name: 'k8s_get_secrets',
    description: 'List Secrets',
    parameters: {
      namespace: { type: 'string', description: 'Namespace name' },
      type: { type: 'string', description: 'Secret type filter' }
    },
    execute: async (params: any) => {
      const ns = params.namespace ? `-n ${params.namespace}` : ''
      const result = await safeExec(`kubectl get secrets ${ns} 2>&1`)
      return { result: result.replace(/[A-Za-z0-9+/=]{20,}/g, '[REDACTED]') }
    }
  })
  .addTool({
    name: 'k8s_top',
    description: 'Show resource (CPU/Memory) usage',
    parameters: {
      type: { type: 'string', description: 'Resource type: nodes or pods' },
      namespace: { type: 'string', description: 'Namespace name for pods' }
    },
    execute: async (params: any) => {
      const type = params.type || 'pods'
      const ns = params.namespace && type === 'pods' ? `-n ${params.namespace}` : ''
      const result = await safeExec(`kubectl top ${type} ${ns} 2>&1`)
      return { result }
    }
  })
  .build()
