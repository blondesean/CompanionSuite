import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import type { Summary } from '../../../shared/types';
import { formatCountdown } from '../../../shared/dates';
import { currentWeek, localDate } from '../../../shared/weeks';
import { api } from '../api';
import { useSession } from '../App';
import { firstName, greeting } from '../format';

interface Tile {
  to: string;
  label: string;
  icon: string;
  tone: string;
  status(s: Summary): { text: string; alert?: boolean };
}

const TILES: Tile[] = [
  {
    to: '/chores',
    label: 'Chores',
    icon: '🧹',
    tone: 'chores',
    status: (s) =>
      s.choresDue === 0 ? { text: 'Nothing due' } : s.choresLeft === 0 ? { text: 'All done ✓' } : { text: `${s.choresLeft} left` },
  },
  {
    to: '/meals',
    label: 'Meals',
    icon: '🍲',
    tone: 'meals',
    status: (s) => ({ text: `${s.mealsPlanned}/4 planned` }),
  },
  {
    to: '/todo',
    label: 'To-Do',
    icon: '✅',
    tone: 'todo',
    status: (s) =>
      s.todosOverdue > 0
        ? { text: `${s.todosOverdue} overdue`, alert: true }
        : s.todosOpen > 0
          ? { text: `${s.todosOpen} open` }
          : { text: 'All clear' },
  },
  {
    to: '/fun',
    label: 'Fun',
    icon: '🎡',
    tone: 'fun',
    status: (s) => ({ text: s.funIdeas === 0 ? 'Add ideas' : `${s.funIdeas} idea${s.funIdeas === 1 ? '' : 's'}` }),
  },
  {
    to: '/dates',
    label: 'Dates',
    icon: '📅',
    tone: 'dates',
    status: (s) =>
      s.nextDate
        ? { text: `${s.nextDate.icon} ${formatCountdown(s.nextDate.daysUntil)}${s.nextDate.daysUntil === 0 ? '!' : ''}` }
        : { text: 'Add dates' },
  },
];

const GRID_SIZE = 9;

export function Home() {
  const { user } = useSession();
  const week = currentWeek();
  const day = localDate();
  const summary = useQuery({ queryKey: ['summary', week, day], queryFn: () => api.summary(week, day) });
  const today = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <main className="page home">
      <header className="home-header">
        <div>
          <p className="eyebrow">{today}</p>
          <h1>
            {greeting()}, {firstName(user.name)}
          </h1>
        </div>
        <Link to="/settings" className="icon-btn" aria-label="Settings">
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.4-2.1.1-1.4-.1-1.4 2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-2.4-1.4L14.2 2h-4l-.4 2.6a7.6 7.6 0 0 0-2.4 1.4l-2.4-1-2 3.4 2 1.6-.1 1.4.1 1.4-2 1.6 2 3.4 2.4-1c.7.6 1.5 1 2.4 1.4l.4 2.6h4l.4-2.6c.9-.3 1.7-.8 2.4-1.4l2.4 1 2-3.4-2-1.6Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
      </header>

      <section className="tile-grid" aria-label="Modules">
        {Array.from({ length: GRID_SIZE }, (_, i) => {
          const tile = TILES[i];
          if (!tile) return <div key={i} className="tile tile-empty" aria-hidden="true" />;
          const status = summary.data ? tile.status(summary.data) : null;
          return (
            <Link key={tile.to} to={tile.to} className={`tile tile-${tile.tone}`}>
              <span className="tile-icon" aria-hidden="true">
                {tile.icon}
              </span>
              <span className="tile-label">{tile.label}</span>
              <span className={`tile-status${status?.alert ? ' alert' : ''}`}>{status?.text ?? ' '}</span>
            </Link>
          );
        })}
      </section>
    </main>
  );
}
