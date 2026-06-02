export interface Notification {
  id: number;
  app: string;
  sender: string;
  title: string | null;
  content: string;
  timestamp: number;
  channel: string | null;
  battery: string | null;
  received_at: number;
  is_read: boolean;
}

export interface Channel {
  name: string;
}

export type RuleType = 'include' | 'exclude';
export type RuleField = 'app' | 'sender' | 'content';

export interface Rule {
  id: number;
  type: RuleType;
  field: RuleField;
  value: string;
  priority: number;
}

export interface IngestPayload {
  app: string;
  sender: string;
  title?: string | null;
  content: string;
  timestamp: number;
  channel?: string | null;
  battery?: string | null;
}

export type SSEEvent =
  | { type: 'notification'; data: Notification }
  | { type: 'ping' };
