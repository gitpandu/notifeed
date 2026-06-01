import { Router } from 'express';
import { markAllRead, markRead } from '../db';

export const readRouter = Router();

readRouter.post('/read', (request, response) => {
  const deviceId = String(request.body?.device_id || '').trim();
  const ids = Array.isArray(request.body?.ids) ? request.body.ids.map(Number) : [];

  if (!deviceId || ids.length === 0 || ids.some((id: number) => !Number.isFinite(id))) {
    response.status(400).json({ error: 'device_id and ids are required' });
    return;
  }

  markRead(deviceId, ids);
  response.status(204).end();
});

readRouter.post('/read/all', (request, response) => {
  const deviceId = String(request.body?.device_id || '').trim();

  if (!deviceId) {
    response.status(400).json({ error: 'device_id is required' });
    return;
  }

  markAllRead(deviceId);
  response.status(204).end();
});
