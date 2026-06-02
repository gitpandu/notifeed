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
  WhatsApp: '#2fd47f',
  Gmail: '#f06464',
  Telegram: '#4cb3ff',
  Slack: '#e36ad6',
  SMS: '#b99cff',
};

const pageStyle: React.CSSProperties = {
  display: 'flex',
  height: '100vh',
  background: '#0b0c0a',
  color: '#f4f0e8',
  fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  overflow: 'hidden',
  position: 'relative',
};

const inputStyle: React.CSSProperties = {
  background: '#151713',
  border: '1px solid #2a2d25',
  color: '#f4f0e8',
  padding: '9px 11px',
  fontSize: 13,
  borderRadius: 10,
  fontFamily: 'inherit',
  outline: 'none',
};

const selectStyle: React.CSSProperties = {
  background: '#151713',
  border: '1px solid #2a2d25',
  color: '#a7aa9b',
  padding: '8px 10px',
  fontSize: 12,
  borderRadius: 10,
  fontFamily: 'inherit',
  outline: 'none',
};

const btnGhostStyle: React.CSSProperties = {
  background: '#11130f',
  border: '1px solid #2a2d25',
  color: '#a7aa9b',
  padding: '8px 12px',
  borderRadius: 999,
  cursor: 'pointer',
  fontSize: 12,
  fontFamily: 'inherit',
};

const btnPrimaryStyle: React.CSSProperties = {
  background: '#d8ff6d',
  border: 'none',
  color: '#11130f',
  padding: '8px 13px',
  borderRadius: 999,
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 800,
  fontFamily: 'inherit',
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
  if (isRead) return '#65695d';

  const t = ageRatio(timestamp);
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * t).toString(16).padStart(2, '0');
  return `#${lerp(0xf4, 0x9b)}${lerp(0xf0, 0x9f)}${lerp(0xe8, 0x92)}`;
}

function appColor(app: string): string {
  return APP_COLORS[app] || '#d8ff6d';
}

function appInitial(app: string): string {
  return app.slice(0, 2).toUpperCase();
}

function ageBorderColor(app: string, timestamp: number, isRead: boolean): string {
  if (isRead) return '#2a2d25';

  const opacity = Math.round((1 - ageRatio(timestamp) * 0.55) * 255).toString(16).padStart(2, '0');
  return appColor(app) + opacity;
}

function formatBattery(value?: string | number | null): string {
  if (value === undefined || value === null || value === '') return '';

  const text = String(value).trim();
  if (!text) return '';

  return text.endsWith('%') ? text : `${text}%`;
}

function latestBattery(notifications: Notification[]): string {
  for (let i = 0; i < notifications.length; i += 1) {
    const battery = formatBattery(notifications[i].battery);
    if (battery) return battery;
  }

  return '';
}

function applyRules(notifications: Notification[], rules: Rule[]): Notification[] {
  return notifications.filter((notification: Notification) => {
    for (let i = 0; i < rules.length; i += 1) {
      const rule = rules[i];
      const value = String(notification[rule.field] || '').toLowerCase();
      const matched = value.includes(rule.value.toLowerCase());

      if (!matched) continue;

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

    if (used.has(notification.id)) continue;

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

  if (stored) return stored;

  const created = Date.now().toString(36) + Math.random().toString(36).slice(2);
  localStorage.setItem(DEVICE_KEY, created);

  return created;
}

function AppBadge({ app }: { app: string }) {
  const color = appColor(app);

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 34, height: 34, borderRadius: 12,
      background: color + '18', border: `1px solid ${color}55`,
      color, fontSize: 11, fontWeight: 900, letterSpacing: '0.05em',
      flexShrink: 0,
    }}>
      {appInitial(app)}
    </span>
  );
}

function BatteryIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}>
      <rect x="1" y="6" width="18" height="12" rx="2" />
      <line x1="23" y1="13" x2="23" y2="11" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function StackIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}>
      <rect x="3" y="10" width="18" height="10" rx="2" />
      <rect x="7" y="6" width="10" height="2" rx="1" />
      <rect x="10" y="2" width="4" height="2" rx="1" />
    </svg>
  );
}

function Pill({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'hot' | 'green' | 'blue' }) {
  const styles: Record<string, React.CSSProperties> = {
    muted: { background: '#191b16', color: '#8c9081', border: '1px solid #2a2d25' },
    hot: { background: '#332113', color: '#ffbf69', border: '1px solid #5b3a16' },
    green: { background: '#1f2913', color: '#d8ff6d', border: '1px solid #3d4c1c' },
    blue: { background: '#121f2d', color: '#8cc9ff', border: '1px solid #244563' },
  };

  return (
    <span style={{
      ...styles[tone],
      display: 'inline-flex', alignItems: 'center', height: 24,
      padding: '0 9px', borderRadius: 999, fontSize: 11, fontWeight: 750,
      whiteSpace: 'nowrap', flexShrink: 0,
    }}>
      {children}
    </span>
  );
}

function NotifCard({ notif, isRead, onRead }: { notif: Notification; isRead: boolean; onRead: () => void }) {
  const battery = formatBattery(notif.battery);

  return (
    <div onClick={onRead} style={{
      padding: '15px 16px',
      borderLeft: `3px solid ${ageBorderColor(notif.app, notif.timestamp, isRead)}`,
      background: isRead ? '#10110e' : 'linear-gradient(135deg, #171914 0%, #10110e 72%)',
      cursor: 'pointer',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 10 }}>
        <AppBadge app={notif.app} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
            <span style={{ fontSize: 13, color: isRead ? '#65695d' : '#d8ff6d', fontWeight: 850, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {notif.sender}
            </span>
            {!isRead && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#d8ff6d', flexShrink: 0 }} />}
          </div>
          <div style={{ fontSize: 11, color: '#65695d', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{notif.app}</div>
        </div>
        <div style={{ display: 'flex', gap: 7, flexShrink: 0 }}>
          {battery && <Pill tone="hot"><BatteryIcon />{battery}</Pill>}
          <Pill><ClockIcon />{relativeTime(notif.timestamp)}</Pill>
        </div>
      </div>

      {notif.title && (
        <div style={{ fontSize: 13, color: isRead ? '#7b7f72' : '#f4f0e8', fontWeight: 800, marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {notif.title}
        </div>
      )}

      <div style={{ fontSize: 14, color: ageColor(notif.timestamp, isRead), lineHeight: 1.52, wordBreak: 'break-word' }}>
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
  const battery = latestBattery(group.items);

  function handleToggle(): void {
    onToggleExpand(isExpanded ? null : group.key);

    if (!isExpanded) {
      for (let i = 0; i < group.items.length; i += 1) {
        onRead(group.items[i].id);
      }
    }
  }

  return (
    <div
      style={{
        position: 'relative',
        borderLeft: `3px solid ${ageBorderColor(group.app, group.timestamp, allRead)}`,
        background: allRead
          ? '#10110e'
          : 'linear-gradient(135deg, #171914 0%, #10110e 72%)',
      }}
    >
      <div
        onClick={handleToggle}
        style={{
          padding: '15px 16px 10px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 11,
        }}
      >
        <AppBadge app={group.app} />

        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              minWidth: 0,
            }}
          >
            <span
              style={{
                fontSize: 13,
                color: allRead ? '#65695d' : '#d8ff6d',
                fontWeight: 850,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
              }}
            >
              {group.sender}
            </span>

            {unreadCount > 0 && (
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: '#d8ff6d',
                  flexShrink: 0,
                }}
              />
            )}
          </div>

          <div
            style={{
              fontSize: 11,
              color: '#65695d',
              marginTop: 2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {group.app}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexShrink: 0,
          }}
        >
          {group.items.length > 1 && (
            <Pill>
              <StackIcon />
              {group.items.length}
            </Pill>
          )}

          {battery && (
            <Pill tone="hot">
              <BatteryIcon />
              {battery}
            </Pill>
          )}

          <Pill>
            <ClockIcon />
            {relativeTime(latest.timestamp)}
          </Pill>
        </div>
      </div>

      {!isExpanded && (
        <div
          style={{
            padding: '0 16px 15px 61px',
            fontSize: 14,
            color: ageColor(latest.timestamp, allRead),
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {latest.content}
        </div>
      )}

      {isExpanded && (
        <div
          style={{
            borderTop: '1px solid #252820',
            marginTop: 3,
          }}
        >
          {group.items.map((notification: Notification) => (
            <div
              key={notification.id}
              style={{
                paddingLeft: 18,
                borderBottom: '1px solid #171914',
              }}
            >
              <NotifCard
                notif={notification}
                isRead={!!readMap[notification.id]}
                onRead={() => onRead(notification.id)}
              />
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
        display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6,
        padding: '8px 9px', borderRadius: 12, fontSize: 12,
        background: hovered ? '#191b16' : '#11130f',
        border: '1px solid ' + (hovered ? '#3a3e32' : '#24271f'),
        cursor: 'grab', userSelect: 'none',
      }}
    >
      <span style={{ color: '#65695d', fontSize: 12, flexShrink: 0 }}>⠿</span>
      <span style={{
        padding: '3px 7px', borderRadius: 999, fontSize: 10, fontWeight: 850, flexShrink: 0,
        background: rule.type === 'exclude' ? '#331818' : '#1f2913',
        color: rule.type === 'exclude' ? '#ff8f8f' : '#d8ff6d',
      }}>{rule.type}</span>
      <span style={{ color: '#8c9081', flexShrink: 0 }}>{rule.field}</span>
      <span style={{ color: '#f4f0e8', fontWeight: 700, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        &quot;{rule.value}&quot;
      </span>
      <span style={{ fontSize: 10, color: '#65695d', flexShrink: 0 }}>#{index + 1}</span>
      <span onClick={() => onRemove(rule.id)} style={{ color: '#8c9081', cursor: 'pointer', fontSize: 12, padding: '0 3px', flexShrink: 0 }}>×</span>
    </div>
  );
}

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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

    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    if (response.status === 204) return undefined as T;

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
        if (previous.some((item: Notification) => item.id === notification.id)) return previous;
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
    if (remaining < 120) loadMore();
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
  const filteredUnread = filtered.filter((notification: Notification) => !readMap[notification.id]).length;

  return (
    <div style={pageStyle}>
      {isMobile && drawerOpen && <div onClick={() => setDrawerOpen(false)} style={{ position: 'fixed', inset: 0, background: '#000000b8', zIndex: 40 }} />}

      <aside style={{
        width: isMobile ? 316 : (sidebarCollapsed ? 64 : 316),
        background: '#0f110d',
        borderRight: '1px solid #24271f',
        flexShrink: 0,
        zIndex: 50,
        transition: isMobile ? 'none' : 'width 0.22s cubic-bezier(0.4,0,0.2,1)',
        ...(isMobile ? {
          position: 'fixed' as const, top: 0, left: 0, bottom: 0,
          transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.22s cubic-bezier(0.4,0,0.2,1)',
          boxShadow: drawerOpen ? '16px 0 42px #000000cc' : 'none',
        } : {}),
      }}>
        {isMobile && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 14px 0' }}>
            <button onClick={() => setDrawerOpen(false)} style={{ ...btnGhostStyle, width: 38, height: 38, padding: 0 }}>×</button>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          <div style={{ padding: '24px 22px 20px', borderBottom: '1px solid #24271f', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, overflow: 'hidden' }}>
              <div style={{ width: 38, height: 38, borderRadius: 14, background: '#d8ff6d', color: '#11130f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 950, flexShrink: 0 }}>NF</div>
              {!sidebarCollapsed && (
                <div>
                  <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: '-0.04em' }}>Notifeed</div>
                </div>
              )}
            </div>
            {!isMobile && (
              <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} style={{ ...btnGhostStyle, width: 32, height: 32, padding: 0, flexShrink: 0 }}>
                {sidebarCollapsed ? '→' : '←'}
              </button>
            )}
          </div>
          {!sidebarCollapsed && (
            <div style={{ padding: '0 22px 20px', flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <Pill tone={backendStatus === 'connected' ? 'green' : 'hot'}>{backendStatus}</Pill>
                <Pill>{totalUnread} unread</Pill>
              </div>
            </div>
          )}

          {!sidebarCollapsed && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '18px 14px' }}>
              <div style={{ padding: '0 8px 9px', fontSize: 11, color: '#65695d', fontWeight: 850, letterSpacing: '0.14em' }}>CHANNELS</div>
              {channels.map((channel: string) => {
                const unread = unreadInChannel(channel);
                const active = activeChannel === channel;
                return (
                  <div
                    key={channel}
                    onClick={() => { setActiveChannel(channel); if (isMobile) setDrawerOpen(false); }}
                    style={{
                      padding: '11px 12px', cursor: 'pointer', borderRadius: 14,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                      background: active ? '#1c2015' : 'transparent',
                      border: active ? '1px solid #384329' : '1px solid transparent',
                      color: active ? '#f4f0e8' : '#8c9081',
                      marginBottom: 5,
                    }}
                  >
                    <span style={{ fontSize: 14, fontWeight: active ? 850 : 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}># {channel}</span>
                    {unread > 0 && <Pill tone="green">{unread}</Pill>}
                  </div>
                );
              })}

              <section style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid #24271f' }}>
                <div onClick={() => setShowChannelMgr((value: boolean) => !value)} style={{ padding: '0 8px 10px', fontSize: 12, color: '#8c9081', cursor: 'pointer', fontWeight: 800 }}>
                  {showChannelMgr ? '−' : '+'} manage channels
                </div>
                {showChannelMgr && (
                  <div style={{ padding: '0 4px' }}>
                    {channels.filter((channel: string) => channel !== 'all').map((channel: string) => (
                      <div key={channel} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7, padding: '8px 10px', background: '#11130f', border: '1px solid #24271f', borderRadius: 12 }}>
                        <span style={{ fontSize: 12, color: '#a7aa9b' }}># {channel}</span>
                        <span onClick={() => removeChannel(channel)} style={{ fontSize: 13, color: '#ff8f8f', cursor: 'pointer', padding: '0 4px' }}>×</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: 7, marginTop: 10 }}>
                      <input value={newChannel} onChange={(event) => setNewChannel(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && addChannel()} placeholder="new channel" style={{ ...inputStyle, minWidth: 0, flex: 1 }} />
                      <button onClick={addChannel} style={btnPrimaryStyle}>add</button>
                    </div>
                  </div>
                )}
              </section>

              <section style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid #24271f' }}>
                <div onClick={() => setShowRules((value: boolean) => !value)} style={{ padding: '0 8px 10px', fontSize: 12, color: '#8c9081', cursor: 'pointer', fontWeight: 800, display: 'flex', justifyContent: 'space-between' }}>
                  <span>{showRules ? '−' : '+'} filter rules</span>
                  {rules.length > 0 && <Pill tone="blue">{rules.length}</Pill>}
                </div>
                {showRules && (
                  <div style={{ padding: '0 4px' }}>
                    {rules.length === 0 && <div style={{ fontSize: 12, color: '#65695d', marginBottom: 10 }}>no active rules</div>}
                    {rules.map((rule: Rule, index: number) => (
                      <RuleRow key={rule.id} rule={rule} index={index} onRemove={removeRule} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd} />
                    ))}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                      <div style={{ display: 'flex', gap: 8 }}>
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
                      <div style={{ display: 'flex', gap: 8 }}>
                        <input value={newRule.value} onChange={(event) => setNewRule((rule: NewRule) => ({ ...rule, value: event.target.value }))} onKeyDown={(event) => event.key === 'Enter' && addRule()} placeholder="value" style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
                        <button onClick={addRule} style={btnPrimaryStyle}>add</button>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}
        </div>
      </aside>

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <header style={{
          borderBottom: '1px solid #24271f',
          padding: isMobile ? '12px' : '18px 22px',
          display: 'flex', alignItems: 'center', gap: 12,
          background: '#0b0c0a', flexShrink: 0,
        }}>
          {isMobile && <button onClick={() => setDrawerOpen(true)} style={{ ...btnGhostStyle, width: 40, height: 40, padding: 0, flexShrink: 0 }}>☰</button>}
          <div style={{ minWidth: 0, flexShrink: 0 }}>
            <div style={{ fontSize: isMobile ? 15 : 20, fontWeight: 950, letterSpacing: '-0.04em' }}>#{activeChannel}</div>
            {!isMobile && <div style={{ fontSize: 12, color: '#65695d', marginTop: 2 }}>{visibleGroups.length} groups · {filteredUnread} unread</div>}
          </div>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="search app, sender, title, content" style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
          {!isMobile && <button onClick={markAllRead} style={{ ...btnGhostStyle, flexShrink: 0 }}>mark all read</button>}
          {isMobile && totalUnread > 0 && <Pill tone="green">{totalUnread}</Pill>}
          {isMobile && <button onClick={markAllRead} style={{ ...btnGhostStyle, flexShrink: 0 }}>read</button>}
        </header>

        {appsInView.length > 0 && (
          <div style={{ display: 'flex', gap: 7, padding: isMobile ? '10px 12px' : '10px 22px', borderBottom: '1px solid #24271f', background: '#0b0c0a', overflowX: 'auto', flexShrink: 0 }}>
            {appsInView.map((app: string) => {
              const collapsed = collapsedApps.has(app);
              return (
                <button key={app} onClick={() => toggleCollapseApp(app)} style={{
                  background: collapsed ? '#11130f' : appColor(app) + '18',
                  border: `1px solid ${collapsed ? '#2a2d25' : appColor(app) + '66'}`,
                  color: collapsed ? '#65695d' : appColor(app),
                  padding: '8px 11px', borderRadius: 999, cursor: 'pointer',
                  fontSize: 12, fontFamily: 'inherit', fontWeight: 800, flexShrink: 0,
                  textDecoration: collapsed ? 'line-through' : 'none',
                }}>{app}</button>
              );
            })}
          </div>
        )}

        <div ref={feedRef} onScroll={handleFeedScroll} style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: isMobile ? 10 : 18 }}>
          {visibleGroups.length === 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#65695d', fontSize: 14 }}>no notifications</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 1040, margin: '0 auto' }}>
            {visibleGroups.map((group: NotificationGroup) => (
              <div key={group.key} style={{ border: '1px solid #24271f', borderRadius: 18, overflow: 'hidden', boxShadow: '0 16px 50px #00000033' }}>
                {group.type === 'group' ? (
                  <GroupCard group={group} readMap={readMap} onRead={markRead} expandedKey={expandedKey} onToggleExpand={setExpandedKey} />
                ) : (
                  <NotifCard notif={group.item} isRead={!!readMap[group.item.id]} onRead={() => markRead(group.item.id)} />
                )}
              </div>
            ))}
          </div>
        </div>

        <footer style={{ borderTop: '1px solid #24271f', padding: '7px 14px', display: 'flex', gap: 12, background: '#0f110d', flexShrink: 0, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#65695d', fontWeight: 900 }}>NOTIFEED</span>
          <span style={{ fontSize: 11, color: '#65695d', marginLeft: 'auto' }}>backend: <span style={{ color: backendStatus === 'connected' ? '#d8ff6d' : '#ffbf69' }}>{backendStatus}</span></span>
          <span style={{ fontSize: 11, color: '#65695d' }}>rules: {rules.length}</span>
        </footer>
      </main>
    </div>
  );
}
