import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

// ── Styles ────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  stack: {
    position: 'fixed',
    bottom: '1.5rem',
    right: '1.5rem',
    zIndex: 100,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    maxWidth: 'min(380px, calc(100vw - 3rem))',
  },

  toast: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    background: 'var(--bg-card)',
    border: '1px solid rgba(252, 129, 129, 0.4)',
    borderLeft: '4px solid var(--red)',
    borderRadius: '8px',
    padding: '0.75rem 1rem',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
    color: 'var(--red)',
    fontSize: '0.85rem',
    lineHeight: 1.5,
  },

  message: {
    flex: 1,
    margin: 0,
    wordBreak: 'break-word',
  },

  dismiss: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: '1rem',
    lineHeight: 1,
    padding: 0,
    fontFamily: 'inherit',
  },
};

// ── Context ───────────────────────────────────────────────────────────────────

export interface Notification {
  id: number;
  message: string;
}

interface NotificationContextValue {
  notify: (message: string) => number;
  dismiss: (id: number) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

/**
 * Holds the queue of active notifications and renders them in a single,
 * fixed-position toast stack so every error surfaces in the same place.
 */
export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const nextId = useRef(0);

  const notify = useCallback((message: string) => {
    const id = nextId.current++;
    setNotifications((current) => [...current, { id, message }]);
    return id;
  }, []);

  const dismiss = useCallback((id: number) => {
    setNotifications((current) => current.filter((n) => n.id !== id));
  }, []);

  const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <div style={styles.stack} aria-live="assertive">
        {notifications.map((n) => (
          <div key={n.id} style={styles.toast} role="alert">
            <p style={styles.message}>{n.message}</p>
            <button
              type="button"
              style={styles.dismiss}
              onClick={() => dismiss(n.id)}
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

/** Imperative access to the notification queue. */
export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return ctx;
}

/**
 * Shows `message` as a notification for as long as it is non-empty, and
 * removes it when the message is cleared, changes, or the caller unmounts.
 * The player can also dismiss it early.
 */
export function useNotification(message: string | null | undefined): void {
  const { notify, dismiss } = useNotifications();

  useEffect(() => {
    if (!message) {
      return;
    }
    const id = notify(message);
    return () => dismiss(id);
  }, [message, notify, dismiss]);
}
