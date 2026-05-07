#!/usr/bin/env node

import { Command } from 'commander';
import { aiCommand } from './commands/ai.js';

const program = new Command();

program
  .name('devflow')
  .description('DevFlow Agent CLI - 可靠、诚实、可控的AI开发助手')
  .version('0.1.0');

program.addCommand(aiCommand);

program.parse();
