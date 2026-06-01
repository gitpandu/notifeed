import { Router } from 'express';
import { getNotifications } from '../db';

export const notificationsRouter = Router();

notificationsRouter.get('/notifications', (request, response) => {
  const channel = typeof request.query.channel === 'string' ? request.query.channel : undefined;
  const deviceId = typeof request.query.device_id === 'string' ? request.query.device_id : undefined;
  const before = typeof request.query.before === 'string' ? Number(request.query.before) : undefined;
  const requestedLimit = typeof request.query.limit === 'string' ? Number(request.query.limit) : 200;
  const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 200, 1), 500);

  response.json(getNotifications({ channel, before, limit, deviceId }));
});
