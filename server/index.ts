import express from 'express';
import path from 'node:path';
import { channelsRouter } from './routes/channels';
import { ingestRouter } from './routes/ingest';
import { notificationsRouter } from './routes/notifications';
import { readRouter } from './routes/read';
import { rulesRouter } from './routes/rules';
import { addSseClient } from './sse';
import './db';

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json({ limit: '256kb' }));

app.use('/api', ingestRouter);
app.use('/api', notificationsRouter);
app.use('/api', channelsRouter);
app.use('/api', rulesRouter);
app.use('/api', readRouter);

app.get('/api/stream', (_request, response) => {
  addSseClient(response);
});

app.get('/api/health', (_request, response) => {
  response.json({ ok: true });
});

const isProduction = process.env.NODE_ENV === 'production';
const publicPath = isProduction
  ? path.join(__dirname, '../../public')
  : path.join(__dirname, '../client/dist');

app.use(express.static(publicPath));
app.get('*', (_request, response) => {
  response.sendFile(path.join(publicPath, 'index.html'));
});

app.listen(port, () => {
  console.log(`Notifeed running on http://localhost:${port}`);
});
