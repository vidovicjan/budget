import { Icon, Logo, type IconName } from './Icon';
import { useUI, type Page } from '../ui';
import { useStore } from '../store';
import { mediumDate } from '../lib/dates';
import { isShared } from '../lib/shared';
import { SpaceSwitcher } from './SpaceSwitcher';

const ITEMS: { page: Page; label: string; icon: IconName }[] = [
  { page: 'overview', label: 'Overview', icon: 'grid' },
  { page: 'transactions', label: 'Transactions', icon: 'swap' },
  { page: 'calendar', label: 'Calendar', icon: 'calendar' },
  { page: 'budgets', label: 'Budgets', icon: 'pie' },
  { page: 'portfolio', label: 'Portfolio', icon: 'trend' },
  { page: 'reports', label: 'Reports', icon: 'bars' },
  { page: 'together', label: 'Together', icon: 'users' },
  { page: 'advisor', label: 'Advisor', icon: 'spark' },
  { page: 'notes', label: 'Notes', icon: 'note' },
  { page: 'settings', label: 'Settings', icon: 'sliders' },
];

export function Sidebar() {
  const { page, go, exportBackup } = useUI();
  const { data, saveError, space } = useStore();
  const shared = isShared(data);
  const last = data.settings.lastBackup;

  return (
    <nav className="sidebar" aria-label="Main navigation">
      <div className="brand">
        <Logo />
        <span className="brand-name">Budget Tracker</span>
      </div>

      <SpaceSwitcher />

      <div className="nav">
        <span className="nav-label">Menu</span>
        {ITEMS.filter((it) => it.page !== 'together' || shared).map((it) => (
          <button key={it.page} type="button" className="nav-item" aria-current={page === it.page ? 'page' : undefined} onClick={() => go(it.page)}>
            <Icon name={it.icon} />
            {it.label}
          </button>
        ))}
      </div>

      <div className="local-card">
        <div className="local-card-title">
          <Icon name="drive" color="#E86F56" />
          <span>{space.kind === 'personal' ? 'Stored locally' : 'Shared by file'}</span>
        </div>
        {saveError ? (
          <p className="warn" role="alert">
            Couldn't save changes: {saveError}
          </p>
        ) : (
          <p>
            {space.kind === 'personal' ? 'All data stays on this device.' : 'Each person keeps a copy; swap files to sync.'}{' '}
            {last ? `Last backup ${mediumDate(last.slice(0, 10))}.` : 'No backup yet.'}
          </p>
        )}
        <button type="button" className="btn btn-ghost-dark" onClick={exportBackup}>
          <Icon name="download" size={16} />
          Export backup
        </button>
      </div>
    </nav>
  );
}
