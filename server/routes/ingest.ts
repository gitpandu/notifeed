import { Router } from 'express';
import { insertNotification } from '../db';
import { broadcastNotification } from '../sse';
import type { IngestPayload } from '../../shared/types';

export const ingestRouter = Router();

ingestRouter.post('/ingest', (request, response) => {
  const body = request.body as Partial<IngestPayload>;

  if (!body.app || !body.sender || !body.content) {
    response.status(400).json({ error: 'app, sender, and content are required' });
    return;
  }

  const notification = insertNotification({
    app: body.app,
    sender: body.sender,
    title: body.title || null,
    content: body.content,
    timestamp: Date.now(),
    channel: body.channel || null,
    battery: body.battery ? `${body.battery}%` : null,
  });

  broadcastNotification(notification);
  response.status(201).json({ id: notification.id });
});
