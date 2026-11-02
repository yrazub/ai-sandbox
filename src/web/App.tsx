import { useState } from 'react';
import { ModelPicker } from './components/ModelPicker';
import { PromptForm } from './components/PromptForm';
import { HistorySection } from './components/HistorySection';
import { ResultsGrid } from './components/ResultsGrid';
import { useHistory } from './hooks/use-history';
import { useModels } from './hooks/use-models';
import { useRunModels } from './hooks/use-run-models';
import { buildHistoryEntry } from './lib/history-storage';

export function App() {
  const [prompt, setPrompt] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const models = useModels();
  const history = useHistory();
  const run = useRunModels({
    onSuccess: (results, request) =>
      history.record(buildHistoryEntry({ request, results, models: models.data })),
  });

  const canRun = prompt.trim().length > 0 && selectedIds.length > 0 && !run.isPending;

  return (
    <main>
      <h1>AI Sandbox</h1>

      <PromptForm
        prompt={prompt}
        onPromptChange={setPrompt}
        canRun={canRun}
        running={run.isPending}
        onRun={() => {
          history.resetSaveFailed();
          run.mutate({ prompt, modelIds: selectedIds });
        }}
      >
        <ModelPicker
          models={models.data}
          loading={models.isPending}
          error={models.error?.message}
          onRetry={() => void models.refetch()}
          selectedIds={selectedIds}
          onSelectedIdsChange={setSelectedIds}
          disabled={run.isPending}
        />
      </PromptForm>

      {run.isError && (
        <p role="alert" className="notice notice-error">
          Run failed: {run.error.message}
        </p>
      )}

      {run.variables && models.data && (run.isPending || run.data) && (
        <ResultsGrid modelIds={run.variables.modelIds} models={models.data} results={run.data} />
      )}

      <HistorySection history={history.history} saveFailed={history.saveFailed} />
    </main>
  );
}
