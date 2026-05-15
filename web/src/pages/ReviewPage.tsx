import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { FileCode2, AlertTriangle, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';

const placeholderIssues = [
  { id: 1, file: 'src/auth/login.ts', line: 42, severity: 'error', message: 'Potential SQL injection vulnerability' },
  { id: 2, file: 'src/auth/login.ts', line: 78, severity: 'warning', message: 'Unhandled promise rejection' },
  { id: 3, file: 'src/utils/helpers.ts', line: 15, severity: 'info', message: 'Consider using optional chaining' },
  { id: 4, file: 'src/api/routes.ts', line: 103, severity: 'error', message: 'Missing error boundary in async handler' },
  { id: 5, file: 'src/components/Form.tsx', line: 56, severity: 'warning', message: 'Deprecated API usage detected' },
];

const severityConfig = {
  error: { icon: <XCircle size={14} />, badge: 'error' as const, color: 'text-error' },
  warning: { icon: <AlertTriangle size={14} />, badge: 'warning' as const, color: 'text-warning' },
  info: { icon: <CheckCircle2 size={14} />, badge: 'info' as const, color: 'text-info' },
};

export default function ReviewPage() {
  return (
    <div className="flex h-full flex-col gap-4 p-6">
      {/* File selection */}
      <Card>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileCode2 size={16} className="text-primary" />
            <span className="text-sm text-text">Select files to review</span>
          </div>
          <Button size="sm" icon={<RefreshCw size={14} />}>Scan</Button>
        </div>
        <div className="mt-3 flex gap-2 flex-wrap">
          {['src/auth/', 'src/api/', 'src/components/'].map((path) => (
            <Badge key={path} className="cursor-pointer hover:bg-bg-tertiary transition-colors">
              {path}
            </Badge>
          ))}
        </div>
      </Card>

      {/* Tabs */}
      <Tabs
        tabs={[
          { key: 'issues', label: 'Issues' },
          { key: 'suggestions', label: 'Suggestions' },
          { key: 'summary', label: 'Summary' },
        ]}
      />

      {/* Issue list + detail */}
      <div className="flex-1 flex gap-4 min-h-0">
        <Card className="w-96 shrink-0 overflow-y-auto">
          <h3 className="text-sm font-semibold text-text mb-3">
            Issues <Badge variant="error">{placeholderIssues.length}</Badge>
          </h3>
          <div className="space-y-2">
            {placeholderIssues.map((issue) => {
              const config = severityConfig[issue.severity as keyof typeof severityConfig];
              return (
                <div
                  key={issue.id}
                  className="flex items-start gap-2 rounded-lg px-3 py-2 bg-bg-secondary cursor-pointer hover:bg-bg-tertiary transition-colors"
                >
                  <span className={config.color}>{config.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-text truncate">{issue.message}</p>
                    <p className="text-xs text-text-muted mt-0.5">
                      {issue.file}:{issue.line}
                    </p>
                  </div>
                  <Badge variant={config.badge}>{issue.severity}</Badge>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Detail panel */}
        <Card className="flex-1 overflow-y-auto">
          <h3 className="text-sm font-semibold text-text mb-3">Issue Detail</h3>
          <div className="rounded-lg bg-bg p-4 font-mono text-xs text-text-secondary leading-relaxed">
            <p className="text-text-muted">// Select an issue to view details...</p>
            <p className="mt-2">
              <span className="text-error">42 | </span>
              <span>const query = `SELECT * FROM users WHERE id = ${'${userId}'};`</span>
            </p>
            <p className="mt-1">
              <span className="text-text-muted">   | </span>
              <span className="text-error underline">                                          ^^^^^^^^</span>
            </p>
            <p className="mt-2 text-warning">Warning: Unsanitized user input in SQL query.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
