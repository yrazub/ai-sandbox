import type { HistoryRead } from '../lib/history-storage';
import { failedCount, formatModelLabels, formatRunTime, promptExcerpt, totalCost } from './history-format';
import { formatCost } from './result-format';

interface Props {
  history: HistoryRead;
  saveFailed: boolean;
}

export function HistorySection({ history, saveFailed }: Props) {
  const entries = history.status === 'available' ? history.entries : [];

  return (
    <section className="history" aria-labelledby="history-heading">
      <div className="history-head">
        <h2 id="history-heading">History ({entries.length})</h2>
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
              <li className="history-row" key={entry.id}>
                <time className="history-time" dateTime={entry.createdAt}>
                  {formatRunTime(entry.createdAt)}
                </time>
                <span className="history-excerpt">{promptExcerpt(entry.prompt)}</span>
                <span className="history-meta">
                  {formatModelLabels(entry.models)}
                  {failed > 0 && <span className="history-failed">{failed} failed</span>}
                  {formatCost(totalCost(entry.results))}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
