import type { RunResult } from '../../shared/contracts';
import { ResultCard } from './ResultCard';

interface Props {
  /** The models of the run, in the order they were selected. */
  models: { id: string; label: string }[];
  /** undefined while the run is in progress. */
  results: RunResult[] | undefined;
}

export function ResultsGrid({ models, results }: Props) {
  return (
    <section className="results" aria-label="Results">
      {models.map(({ id, label }, index) => (
        <ResultCard key={id} label={label} result={results?.[index]} />
      ))}
    </section>
  );
}
