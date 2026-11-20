// Messages between the side panel and the service worker (one long-lived port per open panel,
// named PORT_NAME). Everything is plain JSON.
//
// Panel -> service worker
//   { type: 'hello', windowId }                 a panel opened (the worker answers with 'snapshot')
//   { type: 'start', text, windowId }           start a task in the current chat
//   { type: 'stop' }                            stop the running task now
//   { type: 'takeover' } / { type: 'resume' }   pause so the owner can act / hand control back
//   { type: 'decide', promptId, choice }        answer a prompt (see PROMPT_CHOICES)
//   { type: 'retry', taskId, windowId }         run a finished task again in a fresh conversation
//   { type: 'new-chat' }                        forget the conversation (task cards stay until cleared)
//   { type: 'clear-chat' }                      remove the task cards from the panel too
//   { type: 'ping' }                            keep-alive while a task runs
//
// Service worker -> panel
//   { type: 'snapshot', tasks, running, chatId }   full state (tasks without thumbnails)
//   { type: 'task', task }                         one task changed (without thumbnails)
//   { type: 'thumb', taskId, stepId, dataUrl }     a step's thumbnail
//   { type: 'narration', taskId, text }            Jarvis's live progress line
//   { type: 'thumbs', taskId, thumbs }             all thumbnails of a task (after 'snapshot')

export const PORT_NAME = 'jarvis-panel';

export const PROMPT_CHOICES = Object.freeze({
  site: ['once', 'always', 'deny'],
  confirm: ['approve', 'cancel'],
  budget: ['continue', 'stop'],
  steps: ['continue', 'stop'],
});

export const TASK_STATUS = Object.freeze({
  running: 'running',
  waiting: 'waiting', // a prompt is waiting for the owner
  paused: 'paused', // the owner took over
  done: 'done',
  stopped: 'stopped',
  error: 'error',
  interrupted: 'interrupted',
});

export const FINAL_STATUSES = new Set(['done', 'stopped', 'error', 'interrupted']);
