import { useRef, useState } from 'react';
import { ModelPicker } from './components/ModelPicker';
import { PromptForm } from './components/PromptForm';
import { HistorySection } from './components/HistorySection';
import { formatModelLabels, formatRunTime } from './components/history-format';
import { restoreSelection } from './components/history-restore';
import { ResultsGrid } from './components/ResultsGrid';
import { useHistory } from './hooks/use-history';
import { useModels } from './hooks/use-models';
import { useRunModels } from './hooks/use-run-models';
import { buildHistoryEntry, type HistoryEntry, type HistoryModel } from './lib/history-storage';

export function App() {
  const [prompt, setPrompt] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [restored, setRestored] = useState<HistoryEntry | null>(null);
  const [leftOut, setLeftOut] = useState<HistoryModel[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const models = useModels();
  const history = useHistory();
  const run = useRunModels({
    onSuccess: (results, request) =>
      history.record(buildHistoryEntry({ request, results, models: models.data })),
  });

  const canRun =
    prompt.trim().length > 0 && selectedIds.length > 0 && models.data !== undefined && !run.isPending;

  function handleRestore(entry: HistoryEntry) {
    setPrompt(entry.prompt);
    const selection = restoreSelection(entry.models, models.data);
    setSelectedIds(selection.selectedIds);
    setLeftOut(selection.leftOut);
    setRestored(entry);
    run.reset();
    textareaRef.current?.focus();
  }

  const labels = new Map((models.data ?? []).map((m) => [m.id, m.label]));

  return (
    <main>
      <h1>AI Sandbox</h1>

      <PromptForm
        prompt={prompt}
        onPromptChange={setPrompt}
        canRun={canRun}
        textareaRef={textareaRef}
        running={run.isPending}
        onRun={() => {
          history.resetSaveFailed();
          setRestored(null);
          setLeftOut([]);
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
        {leftOut.length > 0 && (
          <p role="status" className="meta history-notice">
            Not available any more: {formatModelLabels(leftOut)}
          </p>
        )}
      </PromptForm>

      <p role="status" className="visually-hidden">
        {restored ? `Restored run from ${formatRunTime(restored.createdAt)}` : ''}
      </p>

      {run.isError && (
        <p role="alert" className="notice notice-error">
          Run failed: {run.error.message}
        </p>
      )}

      {restored ? (
        <>
          <p className="meta restored-line">From history · {formatRunTime(restored.createdAt)}</p>
          <ResultsGrid models={restored.models} results={restored.results} />
        </>
      ) : (
        run.variables &&
        models.data &&
        (run.isPending || run.data) && (
          <ResultsGrid
            models={run.variables.modelIds.map((id) => ({ id, label: labels.get(id) ?? id }))}
            results={run.data}
          />
        )
      )}

      <HistorySection
        history={history.history}
        saveFailed={history.saveFailed}
        disabled={run.isPending}
        currentId={restored?.id}
        onRestore={handleRestore}
      />
    </main>
  );
}
