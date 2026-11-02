import { useState } from 'react';
import type { HistoryEntry, HistoryRead } from '../lib/history-storage';
import { failedCount, formatModelLabels, formatRunTime, promptExcerpt, totalCost } from './history-format';
import { formatCost } from './result-format';

interface Props {
  history: HistoryRead;
  saveFailed: boolean;
  disabled: boolean;
  currentId: string | undefined;
  onRestore: (entry: HistoryEntry) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}

export function HistorySection({ history, saveFailed, disabled, currentId, onRestore, onDelete, onClear }: Props) {
  const [confirming, setConfirming] = useState(false);
  const entries = history.status === 'available' ? history.entries : [];

  return (
    <section className="history" aria-labelledby="history-heading">
      <div className="history-head">
        <h2 id="history-heading">History ({entries.length})</h2>
        {entries.length > 0 &&
          (confirming ? (
            <span className="history-confirm">
              <span>Delete all {entries.length} runs?</span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  onClear();
                  setConfirming(false);
                }}
              >
                Clear
              </button>
              <button type="button" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </span>
          ) : (
            <button type="button" disabled={disabled} onClick={() => setConfirming(true)}>
              Clear history
            </button>
          ))}
      </div>

      {saveFailed && (
        <p role="status" className="meta history-notice">
          This run could not be saved to history
        </p>
      )}

      {history.status === 'unavailable' ? (
        <p className="empty">History is unavailable in this browser</p>
      ) : entries.length === 0 ? (
        <p className="empty">No runs yet</p>
      ) : (
        <ul className="history-list" aria-label="History">
          {entries.map((entry) => {
            const failed = failedCount(entry.results);
            return (
              <li
                className={entry.id === currentId ? 'history-row history-row-current' : 'history-row'}
                key={entry.id}
              >
                <button
                  type="button"
                  className="history-restore"
                  aria-label={`Restore: ${promptExcerpt(entry.prompt)}`}
                  aria-current={entry.id === currentId ? 'true' : undefined}
                  disabled={disabled}
                  onClick={() => onRestore(entry)}
                >
                  <time className="history-time" dateTime={entry.createdAt}>
                    {formatRunTime(entry.createdAt)}
                  </time>
                  <span className="history-excerpt">{promptExcerpt(entry.prompt)}</span>
                  <span className="history-meta">
                    {formatModelLabels(entry.models)}
                    {failed > 0 && <span className="history-failed">{failed} failed</span>}
                    {formatCost(totalCost(entry.results))}
                  </span>
                </button>
                <button
                  type="button"
                  className="history-delete"
                  aria-label={`Delete run: ${promptExcerpt(entry.prompt)}`}
                  disabled={disabled}
                  onClick={() => onDelete(entry.id)}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
