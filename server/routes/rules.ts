import { Router } from 'express';
import { createRule, deleteRule, getRules, reorderRules } from '../db';
import type { RuleField, RuleType } from '../../shared/types';

export const rulesRouter = Router();

const validTypes = new Set<string>(['include', 'exclude']);
const validFields = new Set<string>(['app', 'sender', 'content']);

rulesRouter.get('/rules', (_request, response) => {
  response.json(getRules());
});

rulesRouter.post('/rules', (request, response) => {
  const type = String(request.body?.type || '');
  const field = String(request.body?.field || '');
  const value = String(request.body?.value || '').trim();

  if (!validTypes.has(type) || !validFields.has(field) || !value) {
    response.status(400).json({ error: 'type, field, and value are required' });
    return;
  }

  response.status(201).json(createRule({
    type: type as RuleType,
    field: field as RuleField,
    value,
  }));
});

rulesRouter.delete('/rules/:id', (request, response) => {
  deleteRule(Number(request.params.id));
  response.status(204).end();
});

rulesRouter.put('/rules/reorder', (request, response) => {
  const ids = Array.isArray(request.body?.ids) ? request.body.ids.map(Number) : [];

  if (ids.length === 0 || ids.some((id: number) => !Number.isFinite(id))) {
    response.status(400).json({ error: 'ids must be a non-empty array' });
    return;
  }

  response.json(reorderRules(ids));
});
