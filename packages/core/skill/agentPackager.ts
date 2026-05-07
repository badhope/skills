import fs from 'fs/promises';
import path from 'path';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import archiver from 'archiver';
import { AgentDefinition, AgentYaml, IntentDefinition, WorkflowDefinition, ToolCallDefinition, TestCase, StageDefinition } from './types';

export class AgentPackager {
  async packageAgent(folderPath: string, outputPath: string): Promise<string> {
    try {
      const output = createWriteStream(outputPath);
      const archive = archiver('zip', {
        zlib: { level: 9 }
      });

      archive.pipe(output);
      archive.directory(folderPath, false);
      await archive.finalize();

      return outputPath;
    } catch (error) {
      console.error('Failed to package agent:', error);
      throw error;
    }
  }

  async createAgentFromTemplate(
    outputPath: string,
    name: string,
    description: string = '',
    author: string = 'Unknown',
    version: string = '1.0.0'
  ): Promise<string> {
    const agentFolderPath = path.join(outputPath, name.toLowerCase().replace(/\s+/g, '-'));
    
    await fs.mkdir(agentFolderPath, { recursive: true });
    await fs.mkdir(path.join(agentFolderPath, 'workflow'));
    await fs.mkdir(path.join(agentFolderPath, 'knowledge'));
    await fs.mkdir(path.join(agentFolderPath, 'tests'));
    await fs.mkdir(path.join(agentFolderPath, 'outputs'));

    await this.createAgentYaml(agentFolderPath, name, description, author, version);
    await this.createSystemPrompt(agentFolderPath, name, description);
    await this.createIntentYaml(agentFolderPath);
    await this.createStagesYaml(agentFolderPath);
    await this.createToolsYaml(agentFolderPath);
    await this.createTestCases(agentFolderPath);
    await this.createReadme(agentFolderPath, name, description);

    return agentFolderPath;
  }

  async createAgentYaml(
    folderPath: string,
    name: string,
    description: string,
    author: string,
    version: string
  ): Promise<void> {
    const agentYamlContent = `version: ${version}
id: ${name.toLowerCase().replace(/\s+/g, '-')}
name: ${name}
description: ${description || 'A powerful AI agent'}
author: ${author}
tags:
  - ai
  - agent

capabilities:
  - id: general-processing
    name: General Processing
    description: Process general requests and tasks
    keywords:
      - help
      - do
      - process
      - complete

tools:
  - id: filesystem
    name: File System
    required: true
    fallback: Manual file operations
  - id: terminal
    name: Terminal
    required: false
    fallback: Manual command execution

execution:
  maxIterations: 30
  defaultTimeout: 60000
  enableReflection: true
  requireConfirmation: false

output:
  format: markdown
  includeSteps: true
  includeConfidence: true
  includeRecommendations: true
`;

    await fs.writeFile(path.join(folderPath, 'agent.yaml'), agentYamlContent);
  }

  async createSystemPrompt(folderPath: string, name: string, description: string): Promise<void> {
    const systemPromptContent = `# ${name}

${description || 'You are a helpful AI agent designed to assist users with various tasks.'}

## Core Responsibilities
1. Understand user requests clearly
2. Process tasks systematically
3. Provide high-quality outputs
4. Follow defined workflows strictly

## Behavior Guidelines
- Always complete all required stages
- Do not skip any steps without explicit permission
- Maintain high quality standards
- Be transparent about your process

## Output Format
Use markdown format for all outputs. Include:
- Clear headings
- Organized sections
- Appropriate formatting
- Actionable recommendations

## Quality Standards
- All outputs must be well-structured
- All claims should be supported
- All recommendations should be practical
- All decisions should be justified
`;

    await fs.writeFile(path.join(folderPath, 'system-prompt.md'), systemPromptContent);
  }

  async createIntentYaml(folderPath: string): Promise<void> {
    const intentYamlContent = `intents:
  - id: general-request
    name: General Request
    description: Handle general user requests
    keywords:
      - help
      - do
      - process
      - complete
    confidenceThreshold: 0.5
    workflow: default

  - id: analyze-task
    name: Analyze Task
    description: Analyze and understand a task
    keywords:
      - analyze
      - understand
      - figure out
      - evaluate
    confidenceThreshold: 0.7
    workflow: analysis

  - id: create-content
    name: Create Content
    description: Create content like documents, code, etc.
    keywords:
      - create
      - write
      - build
      - make
      - generate
    confidenceThreshold: 0.7
    workflow: creation
`;

    await fs.writeFile(path.join(folderPath, 'workflow', 'intent.yaml'), intentYamlContent);
  }

  async createStagesYaml(folderPath: string): Promise<void> {
    const stagesYamlContent = `default:
  name: Default Workflow
  description: Standard workflow for processing requests
  stages:
    - id: stage-1
      name: Understand Request
      description: Analyze and understand the user request thoroughly
      required: true
      timeout: 30000
      tools: []
      outputs:
        - understanding.md

    - id: stage-2
      name: Plan Response
      description: Create a detailed plan for addressing the request
      required: true
      timeout: 30000
      tools: []
      outputs:
        - plan.md

    - id: stage-3
      name: Generate Response
      description: Generate the actual response content
      required: true
      timeout: 60000
      tools: []
      outputs:
        - response.md

    - id: stage-4
      name: Validate and Refine
      description: Review and refine the response for quality
      required: true
      timeout: 30000
      tools: []
      outputs:
        - final-response.md

analysis:
  name: Analysis Workflow
  description: Workflow for analyzing tasks and problems
  stages:
    - id: analysis-1
      name: Gather Information
      description: Collect all relevant information about the task
      required: true
      timeout: 30000
      tools: []
      outputs:
        - info-gathered.md

    - id: analysis-2
      name: Analyze Context
      description: Analyze the collected information in context
      required: true
      timeout: 60000
      tools: []
      outputs:
        - analysis.md

    - id: analysis-3
      name: Identify Patterns
      description: Look for patterns and insights in the analysis
      required: true
      timeout: 30000
      tools: []
      outputs:
        - patterns.md

    - id: analysis-4
      name: Provide Recommendations
      description: Give actionable recommendations based on analysis
      required: true
      timeout: 30000
      tools: []
      outputs:
        - recommendations.md

creation:
  name: Creation Workflow
  description: Workflow for creating new content
  stages:
    - id: creation-1
      name: Requirements Analysis
      description: Understand what needs to be created
      required: true
      timeout: 30000
      tools: []
      outputs:
        - requirements.md

    - id: creation-2
      name: Design
      description: Design the structure and approach
      required: true
      timeout: 30000
      tools: []
      outputs:
        - design.md

    - id: creation-3
      name: Create
      description: Actually create the content
      required: true
      timeout: 60000
      tools: []
      outputs:
        - output.md

    - id: creation-4
      name: Review and Improve
      description: Review and improve the created content
      required: true
      timeout: 30000
      tools: []
      outputs:
        - final-output.md
`;

    await fs.writeFile(path.join(folderPath, 'workflow', 'stages.yaml'), stagesYamlContent);
  }

  async createToolsYaml(folderPath: string): Promise<void> {
    const toolsYamlContent = `tool-calls:
  - id: filesystem-read
    toolId: filesystem
    operation: read
    parameters:
      path:
        type: string
        required: true
        description: File path to read
    safetyLevel: low
    requiresConfirmation: false

  - id: filesystem-write
    toolId: filesystem
    operation: write
    parameters:
      path:
        type: string
        required: true
        description: File path to write
      content:
        type: string
        required: true
        description: Content to write
    safetyLevel: medium
    requiresConfirmation: false

  - id: terminal-execute
    toolId: terminal
    operation: execute
    parameters:
      command:
        type: string
        required: true
        description: Command to execute
    safetyLevel: high
    requiresConfirmation: true
`;

    await fs.writeFile(path.join(folderPath, 'workflow', 'tools.yaml'), toolsYamlContent);
  }

  async createTestCases(folderPath: string): Promise<void> {
    const testCasesContent = `testCases:
  - id: test-1
    name: Simple Request Test
    description: Test handling of simple user requests
    input: Help me understand how to use this agent
    expectedStages:
      - Understand Request
      - Plan Response
      - Generate Response
      - Validate and Refine
    expectedOutputs:
      - understanding.md
      - plan.md
      - response.md
      - final-response.md
    expectedConfidence: 0.8

  - id: test-2
    name: Analysis Test
    description: Test the analysis workflow
    input: Analyze this problem and provide recommendations
    expectedStages:
      - Gather Information
      - Analyze Context
      - Identify Patterns
      - Provide Recommendations
    expectedOutputs:
      - info-gathered.md
      - analysis.md
      - patterns.md
      - recommendations.md
    expectedConfidence: 0.85

  - id: test-3
    name: Creation Test
    description: Test the content creation workflow
    input: Create a document about best practices
    expectedStages:
      - Requirements Analysis
      - Design
      - Create
      - Review and Improve
    expectedOutputs:
      - requirements.md
      - design.md
      - output.md
      - final-output.md
    expectedConfidence: 0.8
`;

    await fs.writeFile(path.join(folderPath, 'tests', 'test_cases.yaml'), testCasesContent);
  }

  async createReadme(folderPath: string, name: string, description: string): Promise<void> {
    const readmeContent = `# ${name}

${description || 'A powerful AI agent packaged as a folder.'}

## Folder Structure

\`\`\`
${name.toLowerCase().replace(/\s+/g, '-')}/
├── agent.yaml          # Agent definition and configuration
├── system-prompt.md    # System prompt and agent persona
├── workflow/           # Workflow definitions
│   ├── intent.yaml     # Intent recognition rules
│   ├── stages.yaml     # Execution stages
│   └── tools.yaml      # Tool call definitions
├── knowledge/          # Knowledge base (optional)
├── tests/              # Test cases (optional)
└── outputs/            # Execution outputs (generated)
\`\`\`

## How to Use

1. **Download** this folder as a ZIP archive
2. **Upload** or share the folder with your AI platform
3. **Run** tasks through the agent using its defined workflow
4. **Review** the outputs in the \`outputs/\` folder

## Customization

You can customize this agent by:
- Editing \`agent.yaml\` to change capabilities and configuration
- Modifying \`system-prompt.md\` to adjust the agent's persona
- Updating \`workflow/\` files to change the execution process
- Adding documents to \`knowledge/\` to provide context
- Editing \`tests/\` to add validation cases

## Workflow

The agent follows a strict workflow:
1. Intent recognition based on \`workflow/intent.yaml\`
2. Stage execution as defined in \`workflow/stages.yaml\`
3. Tool usage according to \`workflow/tools.yaml\`
4. Quality validation and reflection (if enabled)

## Output Format

All outputs follow the format specified in \`agent.yaml\`:
- Markdown by default
- Includes step-by-step process
- Shows confidence levels
- Provides recommendations

---

Created with the "Folder as Agent" framework
`;

    await fs.writeFile(path.join(folderPath, 'README.md'), readmeContent);
  }

  async validateAgentFolder(folderPath: string): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];
    
    try {
      const agentYamlPath = path.join(folderPath, 'agent.yaml');
      await fs.access(agentYamlPath);
    } catch {
      issues.push('Missing agent.yaml');
    }

    try {
      const systemPromptPath = path.join(folderPath, 'system-prompt.md');
      await fs.access(systemPromptPath);
    } catch {
      issues.push('Missing system-prompt.md');
    }

    try {
      const workflowPath = path.join(folderPath, 'workflow');
      await fs.access(workflowPath);
      
      try {
        const intentYamlPath = path.join(workflowPath, 'intent.yaml');
        await fs.access(intentYamlPath);
      } catch {
        issues.push('Missing workflow/intent.yaml');
      }
      
      try {
        const stagesYamlPath = path.join(workflowPath, 'stages.yaml');
        await fs.access(stagesYamlPath);
      } catch {
        issues.push('Missing workflow/stages.yaml');
      }
      
      try {
        const toolsYamlPath = path.join(workflowPath, 'tools.yaml');
        await fs.access(toolsYamlPath);
      } catch {
        issues.push('Missing workflow/tools.yaml');
      }
    } catch {
      issues.push('Missing workflow folder');
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }
}
