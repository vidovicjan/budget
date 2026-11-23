import { useState } from 'react';
import { emptyData, readData } from '../lib/data';
import { todayISO } from '../lib/dates';
import { openTextFile, saveTextFile } from '../lib/files';
import type { LoadError, SpaceMeta } from '../lib/spaces';
import type { AppData } from '../lib/types';
import { ConfirmHost, confirmDialog } from './Confirm';
import { EarlierCopies } from './EarlierCopies';
import { Icon } from './Icon';
import { TitleBar } from './TitleBar';

const EXPLAIN: Record<LoadError['kind'], string> = {
  database: 'The app’s storage didn’t open. If Budget Tracker is already open in another window, close that one first.',
  workspace: 'The list of your spaces is damaged. The budgets themselves are stored separately and can be listed again.',
  read: 'This budget couldn’t be read from storage. That can be temporary, so try again first.',
  unreadable: 'This budget was found, but it isn’t in a form the app understands.',
  missing: 'This budget isn’t in storage any more, but there are earlier copies of it.',
};

/** Shown instead of the app when stored data can't be opened. Nothing is saved while it's visible. */
export function LoadFailure({
  error,
  space,
  otherSpaces,
  onRetry,
  onRebuild,
  onOpenSpace,
  onReplace,
}: {
  error: LoadError;
  /** The space that failed; unset if the list of spaces did. */
  space?: SpaceMeta;
  otherSpaces: SpaceMeta[];
  onRetry: () => void;
  onRebuild: () => Promise<void>;
  onOpenSpace: (id: string) => Promise<void>;
  onReplace: (data: AppData) => Promise<void>;
}) {
  const [problem, setProblem] = useState('');
  const hasRaw = error.raw !== undefined;

  const attempt = (fn: () => Promise<void>) => async () => {
    setProblem('');
    try {
      await fn();
    } catch (err) {
      setProblem(err instanceof SyntaxError ? 'That file is not valid JSON.' : String((err as Error)?.message || err));
    }
  };

  /** What happens to the data that can't be opened, for the confirm dialogs. */
  const fate = hasRaw ? 'What’s stored now is kept as an earlier copy.' : error.kind === 'read' ? 'What’s stored now can’t be read, so it can’t be kept: it’s replaced for good.' : '';

  const restoreFile = attempt(async () => {
    const file = await openTextFile(['json']);
    if (!file) return;
    const { data, skipped } = readData(JSON.parse(file.content));
    const ok = await confirmDialog({
      title: 'Restore this backup?',
      message: `“${space!.name}” is replaced with “${file.name}” (${data.transactions.length} transactions).${skipped.length ? ` Can’t be read and left out: ${skipped.join(', ')}.` : ''} ${fate}`,
      confirmLabel: 'Restore',
      danger: true,
      icon: 'refresh',
    });
    if (ok) await onReplace(data);
  });

  const startFresh = attempt(async () => {
    if (await confirmDialog({ title: 'Start with an empty budget?', message: `“${space!.name}” starts empty. ${fate}`, confirmLabel: 'Start empty', danger: true })) await onReplace(emptyData());
  });

  const saveRaw = attempt(async () => {
    await saveTextFile(`budget-tracker-unreadable-${todayISO()}.json`, JSON.stringify(error.raw, null, 2), 'application/json');
  });

  return (
    <>
      {window.desktop?.customTitleBar && <TitleBar />}
      <div className={`app ${window.desktop?.customTitleBar ? 'framed' : ''}`}>
        <main className="main load-failure">
          <section className="card" aria-labelledby="fail-title" role="alert">
            <div className="stack">
              <h1 id="fail-title" className="card-title">
                Couldn’t load {space ? `“${space.name}”` : 'your data'}
              </h1>
              <p>{EXPLAIN[error.kind]}</p>
              <p>
                <strong>Nothing has been changed or saved over.</strong>
              </p>
              <p className="sub">Details: {error.message}</p>
            </div>
            <div className="load-failure-actions">
              <button type="button" className="btn btn-primary" onClick={onRetry}>
                <Icon name="refresh" size={16} /> Try again
              </button>
              {error.kind === 'workspace' && (
                <button type="button" className="btn btn-secondary" onClick={attempt(onRebuild)}>
                  List my spaces again
                </button>
              )}
              {hasRaw && (
                <button type="button" className="btn btn-secondary" onClick={saveRaw}>
                  <Icon name="download" size={16} /> Save what’s stored as a file
                </button>
              )}
            </div>
            {problem && (
              <div className="banner error" role="alert">
                <Icon name="alert" size={16} />
                {problem}
              </div>
            )}
          </section>

          {space && (
            <section className="card" aria-labelledby="fail-copies">
              <h2 id="fail-copies" className="card-title">
                Restore an earlier copy
              </h2>
              <EarlierCopies spaceId={space.id} spaceName={space.name} onRestore={onReplace} onError={setProblem} />
              <div className="load-failure-actions">
                <button type="button" className="btn btn-secondary" onClick={restoreFile}>
                  <Icon name="upload" size={16} /> Restore a backup file
                </button>
                <button type="button" className="btn btn-danger" onClick={startFresh}>
                  Start with an empty budget
                </button>
              </div>
            </section>
          )}

          {otherSpaces.length > 0 && (
            <section className="card" aria-labelledby="fail-spaces">
              <h2 id="fail-spaces" className="card-title">
                Open another space
              </h2>
              <div className="load-failure-actions">
                {otherSpaces.map((s) => (
                  <button key={s.id} type="button" className="btn btn-secondary" onClick={attempt(() => onOpenSpace(s.id))}>
                    {s.name}
                  </button>
                ))}
              </div>
            </section>
          )}
        </main>
      </div>
      <ConfirmHost />
    </>
  );
}
