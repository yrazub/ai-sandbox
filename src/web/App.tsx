import { useState } from 'react';
import { ModelPicker } from './components/ModelPicker';
import { PromptForm } from './components/PromptForm';
import { ResultsGrid } from './components/ResultsGrid';
import { useModels } from './hooks/use-models';
import { useRunModels } from './hooks/use-run-models';

export function App() {
  const [prompt, setPrompt] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const models = useModels();
  const run = useRunModels();

  const canRun = prompt.trim().length > 0 && selectedIds.length > 0 && !run.isPending;

  return (
    <main>
      <h1>AI Sandbox</h1>

      <PromptForm
        prompt={prompt}
        onPromptChange={setPrompt}
        canRun={canRun}
        running={run.isPending}
        onRun={() => run.mutate({ prompt, modelIds: selectedIds })}
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
    </main>
  );
}
