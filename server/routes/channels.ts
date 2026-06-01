import { Router } from 'express';
import { createChannel, deleteChannel, getChannels } from '../db';

export const channelsRouter = Router();

channelsRouter.get('/channels', (_request, response) => {
  response.json(getChannels());
});

channelsRouter.post('/channels', (request, response) => {
  const name = String(request.body?.name || '').trim().toLowerCase();

  if (!name) {
    response.status(400).json({ error: 'name is required' });
    return;
  }

  response.status(201).json({ name: createChannel(name) });
});

channelsRouter.delete('/channels/:name', (request, response) => {
  deleteChannel(request.params.name);
  response.status(204).end();
});
