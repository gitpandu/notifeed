import { useEffect, useMemo, useRef, useState } from 'react';
import type { Notification, Rule, RuleField, RuleType } from '../shared/types';

type NotificationGroup =
  | { type: 'single'; key: string; item: Notification; app: string; sender: string; timestamp: number }
  | { type: 'group'; key: string; items: Notification[]; app: string; sender: string; timestamp: number };

type ReadMap = Record<number, boolean>;
type NewRule = { type: RuleType; field: RuleField; value: string };

const GROUP_WINDOW = 120 * 1000;
const DEVICE_KEY = 'notifeed_device_id';

const APP_COLORS: Record<string, string> = {
  WhatsApp: '#25d366',
  Gmail: '#ea4335',
  Telegram: '#2aabee',
  Slack: '#e01e5a',
  SMS: '#a78bfa',
};

function relativeTime(timestamp: number): string {
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function ageRatio(timestamp: number): number {
  return Math.min((Date.now() - timestamp) / (24 * 3600 * 1000), 1);
}

function ageColor(timestamp: number, isRead: boolean): string {
  if (isRead) return '#374151';

  const t = ageRatio(timestamp);
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * t).toString(16).padStart(2, '0');
  return `#${lerp(0xc9, 0x4b)}${lerp(0xd1, 0x55)}${lerp(0xdb, 0x63)}`;
}

function appColor(app: string): string {
  return APP_COLORS[app] || '#6b7280';
}

function appInitial(app: string): string {
  return app.slice(0, 2).toUpperCase();
}

function ageBorderColor(app: string, timestamp: number, isRead: boolean): string {
  if (isRead) return '#1f2937';

  const opacity = Math.round((1 - ageRatio(timestamp) * 0.7) * 255).toString(16).padStart(2, '0');
  return appColor(app) + opacity;
}

function applyRules(notifications: Notification[], rules: Rule[]): Notification[] {
  return notifications.filter((notification: Notification) => {
    for (let i = 0; i < rules.length; i += 1) {
      const rule = rules[i];
      const value = String(notification[rule.field] || '').toLowerCase();
      const matched = value.includes(rule.value.toLowerCase());

      if (!matched) {
        continue;
      }

      return rule.type === 'include';
    }

    return true;
  });
}

function groupNotifications(notifications: Notification[]): NotificationGroup[] {
  const sorted = [...notifications].sort((a: Notification, b: Notification) => b.timestamp - a.timestamp);
  const groups: NotificationGroup[] = [];
  const used = new Set<number>();

  for (let i = 0; i < sorted.length; i += 1) {
    const notification = sorted[i];

    if (used.has(notification.id)) {
      continue;
    }

    const key = `${notification.app}::${notification.sender}`;
    const burst: Notification[] = [];

    for (let j = 0; j < sorted.length; j += 1) {
      const candidate = sorted[j];
      const candidateKey = `${candidate.app}::${candidate.sender}`;

      if (!used.has(candidate.id) && candidateKey === key && Math.abs(candidate.timestamp - notification.timestamp) <= GROUP_WINDOW) {
        burst.push(candidate);
      }
    }

    for (let j = 0; j < burst.length; j += 1) {
      used.add(burst[j].id);
    }

    if (burst.length > 1) {
      groups.push({
        type: 'group',
        key: `${key}::${notification.id}`,
        items: burst,
        app: notification.app,
        sender: notification.sender,
        timestamp: burst[0].timestamp,
      });
    } else {
      groups.push({
        type: 'single',
        key: String(notification.id),
        item: notification,
        app: notification.app,
        sender: notification.sender,
        timestamp: notification.timestamp,
      });
    }
  }

  return groups;
}

function getOrCreateDeviceId(): string {
  const stored = localStorage.getItem(DEVICE_KEY);

  if (stored) {
    return stored;
  }

  const created = Date.now().toString(36) + Math.random().toString(36).slice(2);

  localStorage.setItem(DEVICE_KEY, created);

  return created;
}

function AppBadge({ app }: { app: string }) {
  const color = appColor(app);

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 22, height: 22, borderRadius: 4,
      background: color + '22', border: `1px solid ${color}55`,
      color, fontSize: 9, fontWeight: 700, letterSpacing: '0.05em',
      fontFamily: 'monospace', flexShrink: 0,
    }}>
      {appInitial(app)}
    </span>
  );
}

function NotifCard({ notif, isRead, onRead }: { notif: Notification; isRead: boolean; onRead: () => void }) {
  return (
    <div onClick={onRead} style={{
      padding: '8px 12px',
      borderLeft: `2px solid ${ageBorderColor(notif.app, notif.timestamp, isRead)}`,
      background: isRead ? 'transparent' : '#0d111799',
      cursor: 'pointer', transition: 'background 0.15s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
        <AppBadge app={notif.app} />
        <span style={{ fontSize: 11, color: '#4b5563' }}>{notif.app}</span>
        <span style={{ fontSize: 11, color: isRead ? '#4b5563' : '#9ca3af', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {notif.sender}
        </span>
        {notif.battery && (
          <span style={{ fontSize: 10, color: '#f59e0b', background: '#451a03', padding: '1px 5px', borderRadius: 3, flexShrink: 0 }}>
            {notif.battery}
          </span>
        )}
        <span style={{ fontSize: 10, color: '#374151', flexShrink: 0 }}>{relativeTime(notif.timestamp)}</span>
        {!isRead && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#3b82f6', flexShrink: 0 }} />}
      </div>
      {notif.title && (
        <div style={{ fontSize: 11, color: isRead ? '#374151' : '#d1d5db', fontWeight: 600, marginBottom: 2, paddingLeft: 30, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {notif.title}
        </div>
      )}
      <div style={{ fontSize: 12, color: ageColor(notif.timestamp, isRead), paddingLeft: 30, lineHeight: 1.5 }}>
        {notif.content}
      </div>
    </div>
  );
}

function GroupCard({ group, readMap, onRead, expandedKey, onToggleExpand }: {
  group: Extract<NotificationGroup, { type: 'group' }>;
  readMap: ReadMap;
  onRead: (id: number) => void;
  expandedKey: string | null;
  onToggleExpand: (key: string | null) => void;
}) {
  const isExpanded = expandedKey === group.key;
  const allRead = group.items.every((notification: Notification) => readMap[notification.id]);
  const unreadCount = group.items.filter((notification: Notification) => !readMap[notification.id]).length;
  const latest = group.items[0];

  function handleToggle(): void {
    onToggleExpand(isExpanded ? null : group.key);

    if (!isExpanded) {
      for (let i = 0; i < group.items.length; i += 1) {
        onRead(group.items[i].id);
      }
    }
  }

  return (
    <div style={{ borderLeft: `2px solid ${ageBorderColor(group.app, group.timestamp, allRead)}`, background: allRead ? 'transparent' : '#0d111799' }}>
      <div onClick={handleToggle} style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
        <AppBadge app={group.app} />
        <span style={{ fontSize: 11, color: '#4b5563' }}>{group.app}</span>
        <span style={{ fontSize: 11, color: allRead ? '#4b5563' : '#9ca3af', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {group.sender}
        </span>
        <span style={{ fontSize: 9, color: '#3b82f6', background: '#1e3a5f', padding: '1px 5px', borderRadius: 3, flexShrink: 0 }}>
          {isExpanded ? '▾' : '▸'} {group.items.length}
        </span>
        {unreadCount > 0 && <span style={{ fontSize: 9, color: '#f59e0b', background: '#451a03', padding: '1px 5px', borderRadius: 3, flexShrink: 0 }}>{unreadCount}</span>}
        <span style={{ fontSize: 10, color: '#374151', flexShrink: 0 }}>{relativeTime(latest.timestamp)}</span>
      </div>
      {!isExpanded && (
        <div style={{ paddingLeft: 42, paddingBottom: 8, paddingRight: 12, fontSize: 12, color: ageColor(latest.timestamp, allRead), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {latest.content}
        </div>
      )}
      {isExpanded && (
        <div style={{ borderTop: '1px solid #1a2030' }}>
          {group.items.map((notification: Notification) => (
            <div key={notification.id} style={{ paddingLeft: 16, borderBottom: '1px solid #0f1318' }}>
              <NotifCard notif={notification} isRead={!!readMap[notification.id]} onRead={() => onRead(notification.id)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RuleRow({ rule, index, onRemove, onDragStart, onDragOver, onDragEnd }: {
  rule: Rule;
  index: number;
  onRemove: (id: number) => void;
  onDragStart: (index: number) => void;
  onDragOver: (event: React.DragEvent<HTMLDivElement>, index: number) => void;
  onDragEnd: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(event) => onDragOver(event, index)}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4,
        padding: '5px 6px', borderRadius: 3, fontSize: 11,
        background: hovered ? '#0f1520' : 'transparent',
        border: '1px solid ' + (hovered ? '#1f2937' : 'transparent'),
        cursor: 'grab', userSelect: 'none', transition: 'background 0.1s',
      }}
    >
      <span style={{ color: '#2a3040', fontSize: 10, flexShrink: 0 }}>⠿</span>
      <span style={{
        padding: '1px 5px', borderRadius: 3, fontSize: 9, flexShrink: 0,
        background: rule.type === 'exclude' ? '#450a0a' : '#052e16',
        color: rule.type === 'exclude' ? '#f87171' : '#4ade80',
      }}>{rule.type}</span>
      <span style={{ color: '#6b7280', flexShrink: 0 }}>{rule.field}</span>
      <span style={{ color: '#d1d5db', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        &quot;{rule.value}&quot;
      </span>
      <span style={{ fontSize: 9, color: '#2a3040', flexShrink: 0 }}>#{index + 1}</span>
      <span onClick={() => onRemove(rule.id)} style={{ color: '#4b5563', cursor: 'pointer', fontSize: 10, padding: '0 2px', flexShrink: 0 }}>✕</span>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: '#080b0f', border: '1px solid #1a2030',
  color: '#e5e7eb', padding: '4px 8px', fontSize: 11,
  borderRadius: 3, fontFamily: 'inherit', outline: 'none',
};

const selectStyle: React.CSSProperties = {
  background: '#080b0f', border: '1px solid #1a2030',
  color: '#6b7280', padding: '4px 6px', fontSize: 10,
  borderRadius: 3, fontFamily: 'inherit', outline: 'none',
};

const btnGhostStyle: React.CSSProperties = {
  background: 'transparent', border: '1px solid #1f2937',
  color: '#4b5563', padding: '3px 10px', borderRadius: 3,
  cursor: 'pointer', fontSize: 10, fontFamily: 'inherit',
};

const btnPrimaryStyle: React.CSSProperties = {
  background: '#1d3a6e', border: 'none', color: '#93c5fd',
  padding: '4px 12px', borderRadius: 3, cursor: 'pointer',
  fontSize: 10, fontFamily: 'inherit',
};

export default function App() {
  const [deviceId] = useState(getOrCreateDeviceId);
  const [channels, setChannels] = useState<string[]>(['all']);
  const [rules, setRules] = useState<Rule[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [activeChannel, setActiveChannel] = useState('all');
  const [collapsedApps, setCollapsedApps] = useState<Set<string>>(new Set());
  const [newChannel, setNewChannel] = useState('');
  const [showChannelMgr, setShowChannelMgr] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [newRule, setNewRule] = useState<NewRule>({ type: 'exclude', field: 'content', value: '' });
  const [search, setSearch] = useState('');
  const [readMap, setReadMap] = useState<ReadMap>({});
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);
  const [backendStatus, setBackendStatus] = useState('not connected');
  const feedRef = useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = useRef(false);
  const dragIndex = useRef<number | null>(null);

  async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!isMobile) setDrawerOpen(false);
  }, [isMobile]);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const [channelData, ruleData, notificationData] = await Promise.all([
          api<string[]>('/api/channels'),
          api<Rule[]>('/api/rules'),
          api<Notification[]>(`/api/notifications?device_id=${encodeURIComponent(deviceId)}`),
        ]);

        if (cancelled) return;

        setChannels(['all', ...channelData]);
        setRules(ruleData);
        setNotifications(notificationData);
        setReadMap(Object.fromEntries(notificationData.map((notification: Notification) => [notification.id, notification.is_read])));
        setBackendStatus('connected');
      } catch (error) {
        setBackendStatus(error instanceof Error ? error.message : 'connection error');
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [deviceId]);

  useEffect(() => {
    const source = new EventSource('/api/stream');

    source.addEventListener('open', () => setBackendStatus('connected'));
    source.addEventListener('error', () => setBackendStatus('stream error'));
    source.addEventListener('notification', (event) => {
      const notification = JSON.parse((event as MessageEvent).data) as Notification;

      setNotifications((previous: Notification[]) => {
        if (previous.some((item: Notification) => item.id === notification.id)) {
          return previous;
        }

        return [notification, ...previous];
      });
    });

    return () => source.close();
  }, []);

  async function loadMore(): Promise<void> {
    if (loadingMoreRef.current || notifications.length === 0) return;

    const oldest = notifications[notifications.length - 1];
    loadingMoreRef.current = true;

    try {
      const channelQuery = activeChannel !== 'all' ? `&channel=${encodeURIComponent(activeChannel)}` : '';
      const next = await api<Notification[]>(`/api/notifications?device_id=${encodeURIComponent(deviceId)}&before=${oldest.timestamp}${channelQuery}`);

      setNotifications((previous: Notification[]) => {
        const existing = new Set(previous.map((notification: Notification) => notification.id));
        const unique = next.filter((notification: Notification) => !existing.has(notification.id));
        return [...previous, ...unique];
      });

      setReadMap((previous: ReadMap) => {
        const nextMap = { ...previous };
        for (let i = 0; i < next.length; i += 1) {
          nextMap[next[i].id] = next[i].is_read;
        }
        return nextMap;
      });
    } finally {
      loadingMoreRef.current = false;
    }
  }

  function handleFeedScroll(): void {
    const element = feedRef.current;
    if (!element) return;

    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (remaining < 120) {
      loadMore();
    }
  }


  function markRead(id: number): void {
    setReadMap((previous: ReadMap) => ({ ...previous, [id]: true }));
    api<void>('/api/read', {
      method: 'POST',
      body: JSON.stringify({ device_id: deviceId, ids: [id] }),
    }).catch(() => setBackendStatus('read sync failed'));
  }

  function markAllRead(): void {
    setReadMap(Object.fromEntries(notifications.map((notification: Notification) => [notification.id, true])));
    api<void>('/api/read/all', {
      method: 'POST',
      body: JSON.stringify({ device_id: deviceId }),
    }).catch(() => setBackendStatus('read sync failed'));
  }

  function toggleCollapseApp(app: string): void {
    setCollapsedApps((previous: Set<string>) => {
      const next = new Set(previous);
      if (next.has(app)) next.delete(app);
      else next.add(app);
      return next;
    });
  }

  async function addChannel(): Promise<void> {
    const value = newChannel.trim().toLowerCase();
    if (!value || channels.includes(value)) return;

    const created = await api<{ name: string }>('/api/channels', {
      method: 'POST',
      body: JSON.stringify({ name: value }),
    });

    setChannels((previous: string[]) => [...previous, created.name]);
    setNewChannel('');
  }

  async function removeChannel(channel: string): Promise<void> {
    if (channel === 'all') return;

    await api<void>(`/api/channels/${encodeURIComponent(channel)}`, { method: 'DELETE' });
    setChannels((previous: string[]) => previous.filter((item: string) => item !== channel));
    if (activeChannel === channel) setActiveChannel('all');
  }

  async function addRule(): Promise<void> {
    if (!newRule.value.trim()) return;

    const created = await api<Rule>('/api/rules', {
      method: 'POST',
      body: JSON.stringify(newRule),
    });

    setRules((previous: Rule[]) => [...previous, created]);
    setNewRule({ type: 'exclude', field: 'content', value: '' });
  }

  async function removeRule(id: number): Promise<void> {
    await api<void>(`/api/rules/${id}`, { method: 'DELETE' });
    setRules((previous: Rule[]) => previous.filter((rule: Rule) => rule.id !== id));
  }

  function handleDragStart(index: number): void {
    dragIndex.current = index;
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>, index: number): void {
    event.preventDefault();

    if (dragIndex.current === null || dragIndex.current === index) return;

    setRules((previous: Rule[]) => {
      const next = [...previous];
      const moved = next.splice(dragIndex.current as number, 1)[0];
      next.splice(index, 0, moved);
      dragIndex.current = index;
      return next;
    });
  }

  function handleDragEnd(): void {
    dragIndex.current = null;
    const ids = rules.map((rule: Rule) => rule.id);
    api<Rule[]>('/api/rules/reorder', {
      method: 'PUT',
      body: JSON.stringify({ ids }),
    }).then(setRules).catch(() => setBackendStatus('rule reorder failed'));
  }

  const filtered = useMemo(() => {
    let list = notifications;

    if (activeChannel !== 'all') {
      list = list.filter((notification: Notification) => notification.channel === activeChannel);
    }

    list = applyRules(list, rules);

    if (search.trim()) {
      const query = search.toLowerCase();
      list = list.filter((notification: Notification) =>
        notification.app.toLowerCase().includes(query)
        || notification.sender.toLowerCase().includes(query)
        || notification.content.toLowerCase().includes(query)
        || String(notification.title || '').toLowerCase().includes(query),
      );
    }

    return list;
  }, [activeChannel, notifications, rules, search]);

  const groups = useMemo(() => groupNotifications(filtered), [filtered]);
  const appsInView = useMemo(() => Array.from(new Set(groups.map((group: NotificationGroup) => group.app))), [groups]);
  const visibleGroups = useMemo(() => groups.filter((group: NotificationGroup) => !collapsedApps.has(group.app)), [groups, collapsedApps]);

  function unreadInChannel(channel: string): number {
    let list = notifications;

    if (channel !== 'all') {
      list = list.filter((notification: Notification) => notification.channel === channel);
    }

    return applyRules(list, rules).filter((notification: Notification) => !readMap[notification.id]).length;
  }

  const totalUnread = notifications.filter((notification: Notification) => !readMap[notification.id]).length;

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#080b0f', color: '#e5e7eb', fontFamily: "'IBM Plex Mono','Fira Code','Cascadia Code',monospace", fontSize: 15, overflow: 'hidden', position: 'relative' }}>
      {isMobile && drawerOpen && <div onClick={() => setDrawerOpen(false)} style={{ position: 'fixed', inset: 0, background: '#000000aa', zIndex: 40 }} />}

      <div style={{
        width: 320, background: '#0a0e14', borderRight: '1px solid #141920',
        flexShrink: 0, zIndex: 50,
        ...(isMobile ? {
          position: 'fixed' as const, top: 0, left: 0, bottom: 0,
          transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.22s cubic-bezier(0.4,0,0.2,1)',
          boxShadow: drawerOpen ? '4px 0 24px #000000cc' : 'none',
        } : {}),
      }}>
        {isMobile && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 12px 0' }}>
            <button onClick={() => setDrawerOpen(false)} style={{ background: 'none', border: 'none', color: '#4b5563', cursor: 'pointer', fontSize: 20, padding: 4 }}>✕</button>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          <div style={{ padding: '20px 18px 16px', borderBottom: '1px solid #141920', flexShrink: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#f3f4f6', letterSpacing: '0.1em' }}>NOTIFEED</div>
            <div style={{ fontSize: 11, color: '#374151', marginTop: 3 }}>v0.1.0 · live</div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
            <div style={{ padding: '6px 18px 6px', fontSize: 11, color: '#374151', letterSpacing: '0.12em' }}>CHANNELS</div>
            {channels.map((channel: string) => {
              const unread = unreadInChannel(channel);
              const active = activeChannel === channel;
              return (
                <div
                  key={channel}
                  onClick={() => { setActiveChannel(channel); if (isMobile) setDrawerOpen(false); }}
                  style={{
                    padding: '10px 18px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: active ? '#111827' : 'transparent',
                    borderLeft: active ? '3px solid #3b82f6' : '3px solid transparent',
                    color: active ? '#93c5fd' : '#6b7280',
                    transition: 'all 0.1s',
                  }}
                >
                  <span style={{ fontSize: 13 }}># {channel}</span>
                  {unread > 0 && <span style={{ fontSize: 11, background: '#1e3a5f', color: '#60a5fa', padding: '2px 8px', borderRadius: 4 }}>{unread}</span>}
                </div>
              );
            })}

            <div style={{ padding: '12px 18px 6px', borderTop: '1px solid #141920', marginTop: 8 }}>
              <div onClick={() => setShowChannelMgr((value: boolean) => !value)} style={{ fontSize: 12, color: '#4b5563', cursor: 'pointer', marginBottom: showChannelMgr ? 10 : 0 }}>
                {showChannelMgr ? '▾' : '▸'} manage channels
              </div>
              {showChannelMgr && (
                <div>
                  {channels.filter((channel: string) => channel !== 'all').map((channel: string) => (
                    <div key={channel} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: '#6b7280' }}># {channel}</span>
                      <span onClick={() => removeChannel(channel)} style={{ fontSize: 11, color: '#7f1d1d', cursor: 'pointer', padding: '2px 6px' }}>✕</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <input value={newChannel} onChange={(event) => setNewChannel(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && addChannel()} placeholder="new channel" style={inputStyle} />
                    <button onClick={addChannel} style={btnPrimaryStyle}>+</button>
                  </div>
                </div>
              )}
            </div>

            <div style={{ padding: '12px 18px 6px', borderTop: '1px solid #141920', marginTop: 8 }}>
              <div onClick={() => setShowRules((value: boolean) => !value)} style={{ fontSize: 12, color: '#4b5563', cursor: 'pointer', marginBottom: showRules ? 10 : 0, display: 'flex', justifyContent: 'space-between' }}>
                <span>{showRules ? '▾' : '▸'} filter rules</span>
                {rules.length > 0 && <span style={{ fontSize: 11, background: '#1e3a5f', color: '#60a5fa', padding: '2px 8px', borderRadius: 4 }}>{rules.length}</span>}
              </div>
              {showRules && (
                <div>
                  {rules.length === 0 && <div style={{ fontSize: 12, color: '#1f2937', marginBottom: 10 }}>no rules — add one below</div>}
                  {rules.map((rule: Rule, index: number) => (
                    <RuleRow key={rule.id} rule={rule} index={index} onRemove={removeRule} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd} />
                  ))}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <select value={newRule.type} onChange={(event) => setNewRule((rule: NewRule) => ({ ...rule, type: event.target.value as RuleType }))} style={{ ...selectStyle, flex: 1 }}>
                        <option value="exclude">exclude</option>
                        <option value="include">include</option>
                      </select>
                      <select value={newRule.field} onChange={(event) => setNewRule((rule: NewRule) => ({ ...rule, field: event.target.value as RuleField }))} style={{ ...selectStyle, flex: 1 }}>
                        <option value="content">content</option>
                        <option value="sender">sender</option>
                        <option value="app">app</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input value={newRule.value} onChange={(event) => setNewRule((rule: NewRule) => ({ ...rule, value: event.target.value }))} onKeyDown={(event) => event.key === 'Enter' && addRule()} placeholder="value..." style={{ ...inputStyle, flex: 1 }} />
                      <button onClick={addRule} style={btnPrimaryStyle}>add</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>


      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <div style={{ borderBottom: '1px solid #141920', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8, background: '#0a0e14', flexShrink: 0 }}>
          {isMobile && <button onClick={() => setDrawerOpen(true)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 16, padding: '2px 4px', flexShrink: 0, lineHeight: 1 }}>☰</button>}
          <span style={{ fontSize: 11, color: '#374151', flexShrink: 0 }}># {activeChannel}</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="search..." style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
          {isMobile && totalUnread > 0 && <span style={{ fontSize: 9, background: '#1d3a6e', color: '#93c5fd', padding: '2px 6px', borderRadius: 3, fontWeight: 700, flexShrink: 0 }}>{totalUnread}</span>}
          {!isMobile && (
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              {appsInView.map((app: string) => {
                const collapsed = collapsedApps.has(app);
                return (
                  <button key={app} onClick={() => toggleCollapseApp(app)} title={collapsed ? `show ${app}` : `hide ${app}`} style={{
                    background: collapsed ? '#1a1f2e' : appColor(app) + '18',
                    border: `1px solid ${collapsed ? '#1f2937' : appColor(app) + '44'}`,
                    color: collapsed ? '#374151' : appColor(app),
                    padding: '3px 7px', borderRadius: 3, cursor: 'pointer',
                    fontSize: 9, fontFamily: 'inherit', transition: 'all 0.15s',
                    textDecoration: collapsed ? 'line-through' : 'none',
                  }}>{app}</button>
                );
              })}
            </div>
          )}
          {!isMobile && (
            <>
              <span style={{ fontSize: 10, color: '#374151', whiteSpace: 'nowrap', flexShrink: 0 }}>{visibleGroups.length} · {filtered.filter((notification: Notification) => !readMap[notification.id]).length} unread</span>
              <button onClick={markAllRead} style={{ ...btnGhostStyle, flexShrink: 0 }}>mark all read</button>
            </>
          )}
          {isMobile && <button onClick={markAllRead} style={{ ...btnGhostStyle, flexShrink: 0, whiteSpace: 'nowrap' }}>✓ all</button>}
        </div>

        {isMobile && appsInView.length > 0 && (
          <div style={{ display: 'flex', gap: 6, padding: '6px 12px', borderBottom: '1px solid #141920', background: '#080b0f', overflowX: 'auto', flexShrink: 0 }}>
            {appsInView.map((app: string) => {
              const collapsed = collapsedApps.has(app);
              return (
                <button key={app} onClick={() => toggleCollapseApp(app)} style={{
                  background: collapsed ? '#1a1f2e' : appColor(app) + '18',
                  border: `1px solid ${collapsed ? '#1f2937' : appColor(app) + '44'}`,
                  color: collapsed ? '#374151' : appColor(app),
                  padding: '3px 8px', borderRadius: 3, cursor: 'pointer',
                  fontSize: 9, fontFamily: 'inherit', flexShrink: 0,
                  textDecoration: collapsed ? 'line-through' : 'none',
                }}>{app}</button>
              );
            })}
          </div>
        )}

        <div ref={feedRef} onScroll={handleFeedScroll} style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {visibleGroups.length === 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#1f2937', fontSize: 12 }}>no notifications</div>
          )}
          {visibleGroups.map((group: NotificationGroup) => (
            <div key={group.key} style={{ borderBottom: '1px solid #0d1117' }}>
              {group.type === 'group' ? (
                <GroupCard group={group} readMap={readMap} onRead={markRead} expandedKey={expandedKey} onToggleExpand={setExpandedKey} />
              ) : (
                <NotifCard notif={group.item} isRead={!!readMap[group.item.id]} onRead={() => markRead(group.item.id)} />
              )}
            </div>
          ))}
        </div>

        <div style={{ borderTop: '1px solid #141920', padding: '3px 12px', display: 'flex', gap: 12, background: '#0a0e14', flexShrink: 0 }}>
          <span style={{ fontSize: 9, color: '#1f2937' }}>NOTIFEED</span>
          <span style={{ fontSize: 9, color: '#1f2937', marginLeft: 'auto' }}>backend: <span style={{ color: '#374151' }}>{backendStatus}</span></span>
          <span style={{ fontSize: 9, color: '#1f2937' }}>rules: {rules.length}</span>
        </div>
      </div>
    </div>
  );
}
