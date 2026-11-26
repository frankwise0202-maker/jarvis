// Per-task budget and step limits. Pure: the agent loop asks the owner when one is reached.
//
// Budget: before every API request, if the task's estimated cost has reached the limit, Jarvis
// asks to continue; "Continue" raises the limit by one more budget. Steps: before every browser
// action, if the task has taken `maxSteps` actions, Jarvis asks the same way.

import { formatUsd } from '../shared/util.js';

export const DEFAULT_BUDGET_USD = 1.0;
export const DEFAULT_MAX_STEPS = 40;
export const MIN_BUDGET_USD = 0.05;
export const MAX_BUDGET_USD = 50;
export const MIN_STEPS = 1;
export const MAX_STEPS = 500;

/** An empty or missing setting (a cleared field) means the default, not the minimum. */
const blank = (v) => v === undefined || v === null || (typeof v === 'string' && !v.trim());

export function normalizeBudget(v) {
  if (blank(v)) return DEFAULT_BUDGET_USD;
  const n = Number(v);
  if (!Number.isFinite(n)) return DEFAULT_BUDGET_USD;
  return Math.min(MAX_BUDGET_USD, Math.max(MIN_BUDGET_USD, Math.round(n * 100) / 100));
}

export function normalizeSteps(v) {
  if (blank(v)) return DEFAULT_MAX_STEPS;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return DEFAULT_MAX_STEPS;
  return Math.min(MAX_STEPS, Math.max(MIN_STEPS, n));
}

export class Limits {
  constructor({ budgetUsd = DEFAULT_BUDGET_USD, maxSteps = DEFAULT_MAX_STEPS } = {}) {
    this.budget = normalizeBudget(budgetUsd);
    this.maxSteps = normalizeSteps(maxSteps);
    this.budgetLimit = this.budget;
    this.stepLimit = this.maxSteps;
    this.cost = 0;
    this.steps = 0;
  }

  addCost(usd) {
    const n = Number(usd);
    if (Number.isFinite(n) && n > 0) this.cost += n;
  }

  addStep() {
    this.steps += 1;
  }

  /** True when the next API request would continue beyond the budget. */
  budgetReached() {
    return this.cost >= this.budgetLimit;
  }

  /** True when the next browser action would go beyond the step limit. */
  stepsReached() {
    return this.steps >= this.stepLimit;
  }

  /** The limit "Continue" sets: one more budget on top of what has been spent (what the prompt promises). */
  nextBudgetLimit() {
    return Math.round((Math.max(this.budgetLimit, this.cost) + this.budget) * 100) / 100;
  }

  /** "Continue": one more budget on top of what has been spent. */
  extendBudget() {
    this.budgetLimit = this.nextBudgetLimit();
    return this.budgetLimit;
  }

  extendSteps() {
    while (this.stepLimit <= this.steps) this.stepLimit += this.maxSteps;
    return this.stepLimit;
  }

  budgetPrompt() {
    const next = this.nextBudgetLimit();
    return {
      kind: 'budget',
      title: 'Budget reached',
      body: `This task has cost about ${formatUsd(this.cost)}, reaching its ${formatUsd(this.budgetLimit)} budget. Continue up to ${formatUsd(next)}?`,
      choices: [
        { id: 'continue', label: `Continue to ${formatUsd(next)}`, tone: 'primary' },
        { id: 'stop', label: 'Stop here', tone: 'danger' },
      ],
      // (What Jarvis says for it: Voice from Jarvis.)
      voiceFacts: { spent: this.cost, limit: this.budgetLimit, next },
    };
  }

  stepsPrompt() {
    return {
      kind: 'steps',
      title: 'Step limit reached',
      body: `Jarvis has taken ${this.steps} steps on this task (the limit is ${this.stepLimit}). Let it take up to ${this.stepLimit + this.maxSteps}?`,
      choices: [
        { id: 'continue', label: `Allow ${this.maxSteps} more`, tone: 'primary' },
        { id: 'stop', label: 'Stop here', tone: 'danger' },
      ],
      voiceFacts: { limit: this.stepLimit, more: this.maxSteps },
    };
  }

  snapshot() {
    return { cost: this.cost, budget: this.budget, budgetLimit: this.budgetLimit, steps: this.steps, maxSteps: this.maxSteps, stepLimit: this.stepLimit };
  }
}
