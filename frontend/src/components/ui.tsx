import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import type { Member } from '../../../shared/types';
import { addWeeks, currentWeek, formatWeekRange } from '../../../shared/weeks';
import { api } from '../api';
import { firstName } from '../format';

// ---------- members ----------

const MEMBER_COLORS = ['#2a8c82', '#d0643f', '#6b5bd6', '#c2477c'];

export function useMembers() {
  const query = useQuery({ queryKey: ['members'], queryFn: api.members, staleTime: 5 * 60_000 });
  const members = query.data ?? [];
  const byId = new Map(members.map((m) => [m.id, m]));
  return {
    members,
    isLoading: query.isLoading,
    name: (id: string | null | undefined) => (id ? firstName(byId.get(id)?.name ?? 'Someone') : ''),
    color: (id: string | null | undefined) => {
      const i = members.findIndex((m) => m.id === id);
      return i >= 0 ? MEMBER_COLORS[i % MEMBER_COLORS.length] : '#8a847b';
    },
  };
}

export function MemberDot({ member, color, size = 26 }: { member?: Member; color: string; size?: number }) {
  const initial = member ? firstName(member.name).charAt(0).toUpperCase() : '?';
  return (
    <span
      className="member-dot"
      style={{ background: color, width: size, height: size, fontSize: size * 0.46 }}
      title={member?.name}
      aria-label={member?.name}
    >
      {initial}
    </span>
  );
}

// ---------- layout ----------

export function PageHeader({ title, back = '/', right }: { title: string; back?: string; right?: ReactNode }) {
  return (
    <header className="page-header">
      <Link to={back} className="icon-btn" aria-label="Back">
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>
      <h1>{title}</h1>
      <div className="page-header-right">{right}</div>
    </header>
  );
}

export function Tabs({ tabs }: { tabs: { to: string; label: string; end?: boolean }[] }) {
  return (
    <nav className="tabs" role="tablist">
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.end} replace className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function WeekNav({ week, onChange }: { week: string; onChange(week: string): void }) {
  const isCurrent = week === currentWeek();
  return (
    <div className="week-nav">
      <button className="icon-btn" onClick={() => onChange(addWeeks(week, -1))} aria-label="Previous week">
        ‹
      </button>
      <div className="week-nav-label">
        <strong>{formatWeekRange(week)}</strong>
        {isCurrent ? (
          <span className="pill pill-accent">This week</span>
        ) : (
          <button className="pill pill-link" onClick={() => onChange(currentWeek())}>
            Back to this week
          </button>
        )}
      </div>
      <button className="icon-btn" onClick={() => onChange(addWeeks(week, 1))} aria-label="Next week">
        ›
      </button>
    </div>
  );
}

// ---------- feedback ----------

export function Loading() {
  return (
    <div className="loading" aria-busy="true">
      <span className="spinner" />
    </div>
  );
}

export function ErrorNote({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="error-note" role="alert">
      <span>{error instanceof Error ? error.message : 'Something went wrong.'}</span>
      {onRetry && (
        <button className="btn btn-small" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden="true">
        {icon}
      </div>
      <h2>{title}</h2>
      {children}
    </div>
  );
}

// ---------- sheet (bottom modal) ----------

export function Sheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose(): void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={panel}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-header">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function Toast({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="toast" role="status">
      {message}
    </div>
  );
}
