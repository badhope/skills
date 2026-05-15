import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Play, CheckCircle2, Circle, AlertCircle } from 'lucide-react';

const placeholderSteps = [
  { id: 1, title: 'Analyze request', status: 'done' as const },
  { id: 2, title: 'Read source files', status: 'done' as const },
  { id: 3, title: 'Generate changes', status: 'running' as const },
  { id: 4, title: 'Apply modifications', status: 'pending' as const },
  { id: 5, title: 'Run tests', status: 'pending' as const },
];

const statusIcon = {
  done: <CheckCircle2 size={16} className="text-success" />,
  running: <Circle size={16} className="text-primary animate-pulse" />,
  pending: <Circle size={16} className="text-text-muted" />,
  error: <AlertCircle size={16} className="text-error" />,
};

export default function AgentPage() {
  return (
    <div className="flex h-full flex-col gap-4 p-6">
      {/* Task input */}
      <Card>
        <h3 className="text-sm font-semibold text-text mb-3">Task Input</h3>
        <div className="flex gap-2">
          <Input
            placeholder="Describe what you want the agent to do..."
            className="flex-1"
          />
          <Button icon={<Play size={16} />}>Run</Button>
        </div>
      </Card>

      <div className="flex-1 flex gap-4 min-h-0">
        {/* Steps */}
        <Card className="w-72 shrink-0 overflow-y-auto">
          <h3 className="text-sm font-semibold text-text mb-3">Execution Steps</h3>
          <div className="space-y-2">
            {placeholderSteps.map((step) => (
              <div
                key={step.id}
                className="flex items-center gap-2 rounded-lg px-3 py-2 bg-bg-secondary"
              >
                {statusIcon[step.status]}
                <span className="text-sm text-text">{step.title}</span>
                {step.status === 'running' && (
                  <Badge variant="info" className="ml-auto">Running</Badge>
                )}
                {step.status === 'done' && (
                  <Badge variant="success" className="ml-auto">Done</Badge>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* Output */}
        <Card className="flex-1 overflow-y-auto">
          <h3 className="text-sm font-semibold text-text mb-3">Output</h3>
          <div className="rounded-lg bg-bg p-4 font-mono text-xs text-text-secondary leading-relaxed">
            <p className="text-text-muted">// Agent output will appear here...</p>
            <p className="mt-2">Analyzing project structure...</p>
            <p>Found 12 source files to process.</p>
            <p className="mt-2 text-primary">Generating changes for auth module...</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
