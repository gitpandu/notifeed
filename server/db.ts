import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { IngestPayload, Notification, Rule } from "../shared/types";

const dbPath = process.env.DB_PATH || "./data/notifeed.db";

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS channels (
    name TEXT PRIMARY KEY
  );

  CREATE TABLE IF NOT EXISTS rules (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    type     TEXT NOT NULL CHECK(type IN ('include', 'exclude')),
    field    TEXT NOT NULL CHECK(field IN ('app', 'sender', 'content')),
    value    TEXT NOT NULL,
    priority INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    app         TEXT NOT NULL,
    sender      TEXT NOT NULL,
    title       TEXT,
    content     TEXT NOT NULL,
    timestamp   INTEGER NOT NULL,
    channel     TEXT,
    battery     TEXT,
    received_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
  );

  CREATE TABLE IF NOT EXISTS read_state (
    notification_id INTEGER NOT NULL REFERENCES notifications(id),
    device_id       TEXT NOT NULL,
    read_at         INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
    PRIMARY KEY (notification_id, device_id)
  );

  CREATE INDEX IF NOT EXISTS idx_notifications_timestamp ON notifications(timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_notifications_channel ON notifications(channel);
  CREATE INDEX IF NOT EXISTS idx_read_state_device ON read_state(device_id);
`);

export function getRules(): Rule[] {
  return db
    .prepare("SELECT id, type, field, value, priority FROM rules ORDER BY priority ASC, id ASC")
    .all() as unknown as Rule[];
}

export function applyRulesToNotification(notification: Notification, rules: Rule[]): boolean {
  for (let i = 0; i < rules.length; i += 1) {
    const rule = rules[i];
    const rawValue = notification[rule.field];
    const value = String(rawValue || "").toLowerCase();
    const match = value.includes(rule.value.toLowerCase());

    if (rule.type === "exclude" && match) {
      return false;
    }

    if (rule.type === "include" && !match) {
      return false;
    }
  }

  return true;
}

export function getChannels(): string[] {
  const rows = db.prepare("SELECT name FROM channels ORDER BY name ASC").all() as unknown as Array<{ name: string }>;

  return rows.map((row) => row.name);
}

export function createChannel(name: string): string {
  db.prepare("INSERT OR IGNORE INTO channels (name) VALUES (?)").run(name);
  return name;
}

export function deleteChannel(name: string): void {
  db.prepare("DELETE FROM channels WHERE name = ?").run(name);
}

export function insertNotification(payload: IngestPayload): Notification {
  const result = db
    .prepare(`
      INSERT INTO notifications (app, sender, title, content, timestamp, channel, battery)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      payload.app,
      payload.sender,
      payload.title || null,
      payload.content,
      payload.timestamp,
      payload.channel || null,
      payload.battery || null,
    );

  const row = db
    .prepare(`
      SELECT
        id,
        app,
        sender,
        title,
        content,
        timestamp,
        channel,
        battery,
        received_at,
        0 AS is_read
      FROM notifications
      WHERE id = ?
    `)
    .get(Number(result.lastInsertRowid)) as unknown as Notification;

  return {
    ...row,
    is_read: Boolean(row.is_read),
  };
}

export interface GetNotificationsOptions {
  channel?: string;
  limit: number;
  before?: number;
  deviceId?: string;
}

export function getNotifications(options: GetNotificationsOptions): Notification[] {
  const rules = getRules();

  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (options.channel && options.channel !== "all") {
    conditions.push("n.channel = ?");
    params.push(options.channel);
  }

  if (typeof options.before === "number") {
    conditions.push("n.timestamp < ?");
    params.push(options.before);
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const deviceId = options.deviceId || "";

  const rows = db
    .prepare(`
      SELECT
        n.id,
        n.app,
        n.sender,
        n.title,
        n.content,
        n.timestamp,
        n.channel,
        n.battery,
        n.received_at,
        CASE WHEN r.notification_id IS NULL THEN 0 ELSE 1 END AS is_read
      FROM notifications n
      LEFT JOIN read_state r
        ON r.notification_id = n.id
        AND r.device_id = ?
      ${whereSql}
      ORDER BY n.timestamp DESC
      LIMIT ?
    `)
    .all(deviceId, ...params, options.limit) as unknown as Notification[];

  const notifications: Notification[] = [];

  for (let i = 0; i < rows.length; i += 1) {
    const notification = {
      ...rows[i],
      is_read: Boolean(rows[i].is_read),
    };

    if (applyRulesToNotification(notification, rules)) {
      notifications.push(notification);
    }
  }

  return notifications;
}

export function createRule(input: Pick<Rule, "type" | "field" | "value">): Rule {
  const row = db.prepare("SELECT COALESCE(MAX(priority), -1) + 1 AS priority FROM rules").get() as unknown as {
    priority: number;
  };

  const result = db
    .prepare(`
      INSERT INTO rules (type, field, value, priority)
      VALUES (?, ?, ?, ?)
    `)
    .run(input.type, input.field, input.value, row.priority);

  return db
    .prepare("SELECT id, type, field, value, priority FROM rules WHERE id = ?")
    .get(Number(result.lastInsertRowid)) as unknown as Rule;
}

export function deleteRule(id: number): void {
  db.prepare("DELETE FROM rules WHERE id = ?").run(id);
}

export function reorderRules(ids: number[]): void {
  db.exec("BEGIN");

  try {
    const statement = db.prepare("UPDATE rules SET priority = ? WHERE id = ?");

    for (let i = 0; i < ids.length; i += 1) {
      statement.run(i, ids[i]);
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function markRead(deviceId: string, ids: number[]): void {
  db.exec("BEGIN");

  try {
    const statement = db.prepare(`
      INSERT OR IGNORE INTO read_state (notification_id, device_id)
      VALUES (?, ?)
    `);

    for (let i = 0; i < ids.length; i += 1) {
      statement.run(ids[i], deviceId);
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function markAllRead(deviceId: string): void {
  db.exec("BEGIN");

  try {
    db.prepare(`
      INSERT OR IGNORE INTO read_state (notification_id, device_id)
      SELECT id, ? FROM notifications
    `).run(deviceId);

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}