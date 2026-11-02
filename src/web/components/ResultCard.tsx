import type { RunResult } from '../../shared/contracts';
import { formatCost, formatLatency } from './result-format';

interface Props {
  label: string;
  /** undefined while the run is in progress. */
  result: RunResult | undefined;
}

export function ResultCard({ label, result }: Props) {
  if (!result) {
    return (
      <article className="card card-pending" aria-label={label} aria-busy="true">
        <h3>{label}</h3>
        <p role="status">Waiting for the answer…</p>
      </article>
    );
  }

  if (result.status === 'error') {
    return (
      <article className="card card-error" aria-label={label}>
        <h3>{label}</h3>
        <p role="alert">
          <span aria-hidden="true">! </span>
          {result.error}
        </p>
        <p className="meta">{formatLatency(result.latencyMs)}</p>
      </article>
    );
  }

  return (
    <article className="card" aria-label={label}>
      <h3>{label}</h3>
      {/* Plain text on purpose: model output is never rendered as HTML or Markdown. */}
      <p className="answer">{result.output || '(empty answer)'}</p>
      <p className="meta">
        {formatLatency(result.latencyMs)} · {result.inputTokens} in / {result.outputTokens} out
        tokens
      </p>
      <p className="meta">{formatCost(result.costUsd)}</p>
    </article>
  );
}
