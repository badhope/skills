#!/usr/bin/env node
import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import {
  loadAgentFromFolder,
  listAgents,
  createAgentFromTemplate,
  packageAgent,
  validateAgentFolder,
  globalNewSkillOrchestrator
} from '../core/skill';

const program = new Command();

program
  .name('agent-cli')
  .description('Folder as Agent CLI tool')
  .version('3.0.0');

program
  .command('create <name>')
  .description('Create a new agent from template')
  .option('-d, --description <desc>', 'Agent description')
  .option('-a, --author <author>', 'Author name')
  .option('-v, --version <version>', 'Agent version')
  .action(async (name, options) => {
    console.log(`Creating new agent: ${name}`);
    const outputPath = path.join(process.cwd(), name);
    
    try {
      const result = await createAgentFromTemplate(
        outputPath,
        name,
        options.description,
        options.author,
        options.version
      );
      
      console.log(`\n✅ Agent created successfully!`);
      console.log(`   Location: ${outputPath}`);
      console.log(`\n📋 Next steps:`);
      console.log(`   1. cd ${name}`);
      console.log(`   2. Customize the agent configuration`);
      console.log(`   3. Drop the folder to your AI platform`);
      
    } catch (error) {
      console.error('❌ Error creating agent:', error);
      process.exit(1);
    }
  });

program
  .command('validate <folder>')
  .description('Validate an agent folder structure')
  .action(async (folder) => {
    console.log(`Validating agent folder: ${folder}`);
    
    try {
      const result = await validateAgentFolder(path.resolve(folder));
      
      if (result.valid) {
        console.log('\n✅ Agent is valid!');
      } else {
        console.error('\n❌ Agent has issues:');
        result.errors.forEach(e => console.error(`   - ${e}`));
      }
    } catch (error) {
      console.error('❌ Validation error:', error);
      process.exit(1);
    }
  });

program
  .command('package <folder> [output]')
  .description('Package an agent folder into a zip archive')
  .option('-n, --name <name>', 'Output archive name')
  .action(async (folder, output, options) => {
    const folderPath = path.resolve(folder);
    const outputPath = output ? path.resolve(output) : `${folderPath}.zip`;
    
    console.log(`Packaging agent: ${folderPath}`);
    
    try {
      const result = await packageAgent(folderPath, outputPath);
      
      console.log('\n✅ Agent packaged successfully!');
      console.log(`   Output: ${outputPath}`);
    } catch (error) {
      console.error('❌ Packaging error:', error);
      process.exit(1);
    }
  });

program
  .command('list [folder]')
  .description('List all agents in the base directory')
  .action(async (folder) => {
    const basePath = folder ? path.resolve(folder) : process.cwd();
    console.log(`Listing agents in: ${basePath}`);
    
    try {
      const agents = await listAgents(basePath);
      
      if (agents.length === 0) {
        console.log('\nℹ️ No agents found');
      } else {
        console.log(`\n✅ Found ${agents.length} agent(s):`);
        agents.forEach(agent => {
          console.log(`\n   📁 ${agent.name}`);
          if (agent.description) {
            console.log(`      ${agent.description}`);
          }
          console.log(`      ${agent.path}`);
        });
      }
    } catch (error) {
      console.error('❌ Error listing agents:', error);
      process.exit(1);
    }
  });

program
  .command('run <folder>')
  .description('Run an agent with a task')
  .option('-t, --task <task>', 'Task to execute')
  .action(async (folder, options) => {
    const folderPath = path.resolve(folder);
    console.log(`Running agent: ${folderPath}`);
    
    if (!options.task) {
      console.error('❌ Please provide a task with -t/--task');
      process.exit(1);
    }
    
    try {
      const agent = await loadAgentFromFolder(folderPath);
      const workflow = agent.workflows?.find(w => w.id === 'full-project-workflow') || {
        name: 'Default Workflow',
        stages: []
      };
      
      console.log('\n🚀 Executing task:', options.task);
      
      const execution = await globalNewSkillOrchestrator.executeWorkflow(
        workflow,
        options.task,
        ['filesystem', 'terminal']
      );
      
      console.log('\n📊 Execution complete!');
      console.log(`Status: ${execution.status}`);
      console.log(`Results: ${execution.results.length} stage(s)`);
      
    } catch (error) {
      console.error('❌ Execution error:', error);
      process.exit(1);
    }
  });

program
  .command('skills')
  .description('List available skills')
  .action(() => {
    const skills = globalNewSkillOrchestrator.getAllSkills();
    
    if (skills.length === 0) {
      console.log('\nℹ️ No skills available');
      return;
    }
    
    console.log('\n✅ Available skills:');
    skills.forEach(skill => {
      console.log(`\n   ${skill.skillId}`);
      console.log(`      ${skill.skillName}`);
      console.log(`      ${skill.description}`);
    });
  });

console.log('\n📚 Agent CLI tool initialized');
program.parse();
