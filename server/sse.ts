import type { Response } from 'express';
import type { Notification } from '../shared/types';

const clients = new Set<Response>();

export function addSseClient(response: Response): void {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'X-Accel-Buffering': 'no',
    Connection: 'keep-alive',
  });

  response.write(': connected\n\n');
  clients.add(response);

  response.on('close', () => {
    clients.delete(response);
  });
}

export function broadcastNotification(notification: Notification): void {
  const payload = JSON.stringify(notification);

  for (const client of clients) {
    client.write(`event: notification\n`);
    client.write(`data: ${payload}\n\n`);
  }
}

setInterval(() => {
  for (const client of clients) {
    client.write(': ping\n\n');
  }
}, 30000);
