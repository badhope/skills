# @devflow/sdk

Programmatic API for DevFlow Agent.

## Installation

```bash
npm install @devflow/sdk
```

## Quick Start

```typescript
import { runAgent, parseFile, generateRepoMap } from '@devflow/sdk';

// Run agent
const result = await runAgent('Add error handling to the auth module');
console.log(result.output);

// Parse a file
const parsed = await parseFile('./src/auth.ts');
console.log(parsed.symbols);

// Generate repo map
const map = await generateRepoMap('./src');
console.log(map);
```

## API Reference

### Agent

The `DevFlowAgent` class provides full control over agent execution.

```typescript
import { DevFlowAgent } from '@devflow/sdk/agent';

const agent = new DevFlowAgent({
  model: 'claude-3-5-sonnet',
  temperature: 0.3,
  autoCheckpoint: true
});

// Listen to events
agent.on('step', (step) => {
  console.log(`Step ${step.id}: ${step.description}`);
});

agent.on('output', (text) => {
  console.log(text);
});

// Run a task
const result = await agent.run('Refactor the database module');

if (result.success) {
  console.log('Task completed successfully');
  console.log('Changed files:', result.changedFiles);
} else {
  console.error('Task failed:', result.output);
}
```

#### Agent Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `model` | `string` | `'claude-3-5-sonnet'` | LLM model to use |
| `temperature` | `number` | `0.3` | Generation temperature (0-1) |
| `maxTokens` | `number` | `2048` | Maximum response tokens |
| `planFirst` | `boolean` | `true` | Plan before executing |
| `autoCheckpoint` | `boolean` | `true` | Create git checkpoints |
| `onStep` | `function` | - | Step progress callback |
| `onOutput` | `function` | - | Output text callback |

#### Convenience Function

```typescript
import { runAgent } from '@devflow/sdk';

const result = await runAgent('Add tests for the API module', {
  model: 'gpt-4',
  temperature: 0.5
});
```

### Parser

The `DevFlowParser` class provides code parsing and analysis.

```typescript
import { DevFlowParser } from '@devflow/sdk/parser';

const parser = new DevFlowParser();

// Parse a file
const result = await parser.parseFile('./src/app.ts');
console.log(`Language: ${result.language}`);
console.log(`Symbols: ${result.symbols.length}`);
console.log(`Tokens: ${result.tokens}`);

// Parse source code directly
const parsed = await parser.parseSource(
  'function hello() { return "world"; }',
  'typescript'
);

// Generate repo map for context
const map = await parser.generateRepoMap('./src', {
  maxTokens: 4096,
  excludePatterns: ['**/*.test.ts']
});
```

#### Symbol Types

```typescript
interface Symbol {
  name: string;
  kind: 'function' | 'class' | 'interface' | 'method' | 'variable' | 'type' | 'enum';
  startLine: number;
  endLine: number;
  signature?: string;
  parent?: string;
}
```

### Editor

The `DevFlowEditor` class provides code editing capabilities using the SEARCH/REPLACE pattern.

```typescript
import { DevFlowEditor } from '@devflow/sdk/editor';

const editor = new DevFlowEditor();

// Single edit
const result = await editor.edit({
  filePath: './src/app.ts',
  search: 'function oldName()',
  replace: 'function newName()'
});

if (result.success) {
  console.log('Edit applied');
  console.log('Diff:', result.diff);
}

// Multiple edits
const results = await editor.applyEdits([
  { filePath: './src/a.ts', search: 'foo', replace: 'bar' },
  { filePath: './src/b.ts', search: 'baz', replace: 'qux' }
]);

// Locate a symbol
const location = await editor.locateSymbol('./src/app.ts', 'myFunction');
if (location) {
  console.log(`Found at line ${location.line}, column ${location.column}`);
}

// Find all references
const refs = await editor.findReferences('myFunction', './src');
refs.forEach(ref => {
  console.log(`${ref.filePath}:${ref.line}`);
});
```

### Plugins

The `DevFlowPlugins` class manages plugins and MCP servers.

```typescript
import { DevFlowPlugins } from '@devflow/sdk/plugins';

const plugins = new DevFlowPlugins();

// List plugins
const list = await plugins.list();
list.forEach(p => {
  console.log(`${p.name} (${p.version}): ${p.enabled ? 'enabled' : 'disabled'}`);
});

// Enable/disable plugins
await plugins.enable('my-plugin');
await plugins.disable('other-plugin');

// List MCP servers
const mcpServers = await plugins.listMCP();
mcpServers.forEach(s => {
  console.log(`${s.name}: ${s.tools.length} tools`);
});
```

## Events

The agent emits events during execution:

```typescript
agent.on('step', (step: AgentStep) => {
  // step.id - Step number
  // step.description - What the step does
  // step.tool - Tool being used (if any)
  // step.status - 'pending' | 'running' | 'done' | 'error' | 'skipped'
  // step.result - Output (if completed)
  // step.error - Error message (if failed)
});

agent.on('output', (text: string) => {
  // Console output from the agent
});

agent.on('error', (error: Error) => {
  // Error occurred
});
```

## Error Handling

```typescript
const result = await agent.run('Do something');

if (!result.success) {
  console.error('Task failed:', result.output);

  // Check for failed steps
  result.steps
    .filter(s => s.status === 'error')
    .forEach(s => {
      console.error(`Step ${s.id} failed: ${s.error}`);
    });
}
```

## TypeScript Support

The SDK is written in TypeScript and provides full type definitions:

```typescript
import type {
  AgentOptions,
  AgentResult,
  AgentStep,
  ParseResult,
  Symbol,
  EditOptions,
  PluginInfo
} from '@devflow/sdk';
```

## License

MIT
