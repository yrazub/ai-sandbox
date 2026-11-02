import type { ModelInfo, RunResult } from '../../shared/contracts';
import { ResultCard } from './ResultCard';

interface Props {
  /** The models of the run, in the order they were selected. */
  modelIds: string[];
  models: ModelInfo[];
  /** undefined while the run is in progress. */
  results: RunResult[] | undefined;
}

export function ResultsGrid({ modelIds, models, results }: Props) {
  const labels = new Map(models.map((model) => [model.id, model.label]));
  return (
    <section className="results" aria-label="Results">
      {modelIds.map((id, index) => (
        <ResultCard key={id} label={labels.get(id) ?? id} result={results?.[index]} />
      ))}
    </section>
  );
}
