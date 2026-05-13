import { Command } from 'commander';
import { chatStartCommand } from './chat/chat-start.js';
import { chatAskCommand } from './chat/chat-ask.js';
import { chatModelsCommand, chatSearchCommand, chatRemoteModelsCommand } from './chat/chat-models.js';

export const chatCommand = new Command('chat')
  .description('与 AI 对话');
chatCommand.addCommand(chatStartCommand);
chatCommand.addCommand(chatAskCommand);
chatCommand.addCommand(chatModelsCommand);
chatCommand.addCommand(chatSearchCommand);
chatCommand.addCommand(chatRemoteModelsCommand);
