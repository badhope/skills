import { TaskContext, TaskStep, TaskResult, Workflow, WorkflowPhase } from './types';
import { TaskStateManager, TaskState } from './taskStateManager';

function escapeDotString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

export interface TaskProgress {
  taskId: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'paused';
  currentPhase?: string;
  currentStep?: string;
  progress: number;
  totalSteps: number;
  completedSteps: number;
  phases: PhaseProgress[];
  history: TaskStep[];
  startTime?: Date;
  elapsedTime?: string;
  estimatedTimeRemaining?: string;
}

export interface PhaseProgress {
  id: string;
  name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress: number;
  tasks: TaskStepProgress[];
}

export interface TaskStepProgress {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  type: string;
  startTime?: Date;
  endTime?: Date;
  duration?: string;
}

export interface WorkflowVisualization {
  workflow: Workflow;
  progress: TaskProgress;
  graph: GraphNode[];
  summary: VisualizationSummary;
}

export interface GraphNode {
  id: string;
  type: 'phase' | 'step' | 'tool' | 'skill';
  label: string;
  status: string;
  children?: GraphNode[];
  dependencies?: string[];
}

export interface VisualizationSummary {
  totalPhases: number;
  completedPhases: number;
  totalSteps: number;
  completedSteps: number;
  successRate: number;
  avgStepDuration: string;
  totalDuration: string;
}

export class TaskVisualizationManager {
  private stateManager: TaskStateManager;

  constructor(stateManager?: TaskStateManager) {
    this.stateManager = stateManager || new TaskStateManager();
  }

  async getTaskProgress(taskId: string): Promise<TaskProgress | null> {
    const state = await this.stateManager.load(taskId);
    
    if (!state) {
      return null;
    }

    const totalSteps = state.history.length + this.countRemainingSteps(state);
    const completedSteps = state.history.length;
    const progress = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

    const phases = await this.getPhaseProgress(state);

    const elapsedTime = state.startedAt 
      ? this.formatDuration(Date.now() - state.startedAt.getTime())
      : undefined;

    const estimatedTimeRemaining = elapsedTime && progress > 0
      ? this.formatDuration((Date.now() - (state.startedAt?.getTime() || Date.now())) * ((100 - progress) / progress))
      : undefined;

    return {
      taskId: state.taskId,
      description: state.description,
      status: state.status,
      currentPhase: state.currentPhase,
      currentStep: state.currentStep,
      progress,
      totalSteps,
      completedSteps,
      phases,
      history: state.history,
      startTime: state.startedAt,
      elapsedTime,
      estimatedTimeRemaining
    };
  }

  private countRemainingSteps(state: TaskState): number {
    return 10;
  }

  private async getPhaseProgress(state: TaskState): Promise<PhaseProgress[]> {
    return [];
  }

  generateWorkflowGraph(workflow: Workflow, progress?: TaskProgress): GraphNode[] {
    const nodes: GraphNode[] = [];

    for (const phase of workflow.phases) {
      const phaseStatus = progress?.currentPhase === phase.id 
        ? 'in_progress' 
        : progress?.phases.find(p => p.id === phase.id)?.status || 'pending';

      const children: GraphNode[] = phase.tasks.map(task => ({
        id: task.id,
        type: 'step',
        label: task.description,
        status: this.getStepStatus(task.id, progress),
        dependencies: task.dependencies
      }));

      nodes.push({
        id: phase.id,
        type: 'phase',
        label: phase.name,
        status: phaseStatus,
        children
      });
    }

    return nodes;
  }

  private getStepStatus(stepId: string, progress?: TaskProgress): string {
    if (!progress) return 'pending';
    
    const completedStep = progress.history.find(h => h.skillName === stepId);
    if (completedStep) {
      return completedStep.status === 'success' ? 'completed' : 'failed';
    }
    
    if (progress.currentStep === stepId) {
      return 'in_progress';
    }
    
    return 'pending';
  }

  generateProgressBar(progress: number, length: number = 20): string {
    const filled = Math.round((progress / 100) * length);
    const empty = length - filled;
    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}] ${progress.toFixed(1)}%`;
  }

  generateTextReport(taskId: string, progress: TaskProgress): string {
    let report = `\n📋 Task Progress Report\n`;
    report += `════════════════════════════════════\n\n`;
    report += `Task ID: ${taskId}\n`;
    report += `Description: ${progress.description}\n`;
    report += `Status: ${this.formatStatus(progress.status)}\n\n`;
    
    if (progress.startTime) {
      report += `Started: ${progress.startTime.toLocaleString()}\n`;
    }
    if (progress.elapsedTime) {
      report += `Elapsed: ${progress.elapsedTime}\n`;
    }
    if (progress.estimatedTimeRemaining) {
      report += `Estimated remaining: ${progress.estimatedTimeRemaining}\n\n`;
    }
    
    report += `Progress: ${this.generateProgressBar(progress.progress)}\n`;
    report += `Steps: ${progress.completedSteps}/${progress.totalSteps}\n\n`;
    
    report += `📊 Phase Progress:\n`;
    for (const phase of progress.phases) {
      report += `  • ${phase.name}: ${this.formatStatus(phase.status as any)} (${phase.progress.toFixed(0)}%)\n`;
    }
    
    if (progress.history.length > 0) {
      report += `\n🔄 Execution History:\n`;
      for (const step of progress.history.slice(-5)) {
        const statusIcon = step.status === 'success' ? '✅' : '❌';
        report += `  ${statusIcon} ${step.skillName}: ${step.input?.substring(0, 50)}...\n`;
      }
    }
    
    report += `\n════════════════════════════════════\n`;
    
    return report;
  }

  private formatStatus(status: string): string {
    const statusMap: Record<string, string> = {
      pending: '⏳ Pending',
      in_progress: '🚀 In Progress',
      completed: '✅ Completed',
      failed: '❌ Failed',
      paused: '⏸️ Paused'
    };
    return statusMap[status] || status;
  }

  private formatDuration(ms: number): string {
    if (ms < 0) return 'Calculating...';
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }

  async generateWorkflowVisualization(taskId: string, workflow: Workflow): Promise<WorkflowVisualization> {
    const progress = await this.getTaskProgress(taskId);
    const graph = this.generateWorkflowGraph(workflow, progress);
    
    const totalSteps = workflow.phases.reduce((sum, phase) => sum + phase.tasks.length, 0);
    const completedSteps = progress?.completedSteps || 0;
    
    const summary: VisualizationSummary = {
      totalPhases: workflow.phases.length,
      completedPhases: progress?.phases.filter(p => p.status === 'completed').length || 0,
      totalSteps,
      completedSteps,
      successRate: progress?.history.filter(h => h.status === 'success').length / (progress?.history.length || 1) * 100,
      avgStepDuration: 'N/A',
      totalDuration: progress?.elapsedTime || 'N/A'
    };

    return {
      workflow,
      progress: progress!,
      graph,
      summary
    };
  }

  generateDotGraph(workflow: Workflow, progress?: TaskProgress): string {
    let dot = 'digraph Workflow {\n';
    dot += '  rankdir=TB;\n';
    dot += '  node [shape=box, style=filled];\n\n';

    for (let i = 0; i < workflow.phases.length; i++) {
      const phase = workflow.phases[i];
      const phaseColor = progress?.currentPhase === phase.id 
        ? '#FFD700' 
        : progress?.phases.find(p => p.id === phase.id)?.status === 'completed'
          ? '#90EE90' 
          : '#E0E0E0';

      dot += `  subgraph cluster_${phase.id} {\n`;
      dot += `    label = "${phase.name}";\n`;
      dot += `    style=filled;\n`;
      dot += `    color="${phaseColor}";\n`;

      for (const task of phase.tasks) {
        const taskColor = this.getStepStatus(task.id, progress) === 'completed'
          ? '#90EE90'
          : this.getStepStatus(task.id, progress) === 'in_progress'
            ? '#FFD700'
            : '#FFFFFF';
        
        dot += `    "${escapeDotString(task.id)}" [label="${escapeDotString(task.description)}", color="${taskColor}"];\n`;
      }

      dot += '  }\n\n';

      if (i < workflow.phases.length - 1) {
        dot += `  "${phase.id}" -> "cluster_${workflow.phases[i + 1].id}";\n`;
      }
    }

    dot += '}';
    return dot;
  }
}

export const globalTaskVisualizationManager = new TaskVisualizationManager();