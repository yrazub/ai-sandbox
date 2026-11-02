import { useState } from 'react';
import { MAX_MODELS_PER_RUN, type ModelInfo } from '../../shared/contracts';
import { filterModels, formatUsdPerMTok, isExpensive } from './model-search';

interface Props {
  models: ModelInfo[] | undefined;
  loading: boolean;
  error: string | undefined;
  onRetry: () => void;
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
  disabled: boolean;
}

export function ModelPicker({
  models,
  loading,
  error,
  onRetry,
  selectedIds,
  onSelectedIdsChange,
  disabled,
}: Props) {
  const [query, setQuery] = useState('');

  if (loading) return <p role="status">Loading models…</p>;
  if (error || !models) {
    return (
      <div role="alert" className="notice notice-error">
        <p>Could not load models: {error ?? 'unknown error'}</p>
        <button type="button" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }

  const byId = new Map(models.map((model) => [model.id, model]));
  const visible = filterModels(models, query);
  const atLimit = selectedIds.length >= MAX_MODELS_PER_RUN;

  function toggle(id: string) {
    onSelectedIdsChange(
      selectedIds.includes(id) ? selectedIds.filter((s) => s !== id) : [...selectedIds, id],
    );
  }

  return (
    <fieldset className="model-picker" disabled={disabled}>
      <legend>
        Models ({selectedIds.length} of {MAX_MODELS_PER_RUN} selected)
      </legend>

      <ul className="chips" aria-label="Selected models">
        {selectedIds.map((id) => {
          const label = byId.get(id)?.label ?? id;
          return (
            <li key={id} className="chip">
              {label}
              <button type="button" aria-label={`Remove ${label}`} onClick={() => toggle(id)}>
                ×
              </button>
            </li>
          );
        })}
      </ul>

      <label htmlFor="model-search">Search</label>
      <input
        id="model-search"
        type="search"
        value={query}
        placeholder="Name or ID, e.g. opus or anthropic"
        onChange={(event) => setQuery(event.target.value)}
      />

      <ul className="model-list" aria-label="Available models">
        {visible.map((model) => {
          const selected = selectedIds.includes(model.id);
          return (
            <li key={model.id}>
              <label>
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={!selected && atLimit}
                  onChange={() => toggle(model.id)}
                />
                <span className="model-name">
                  {model.label} <span className="model-id">{model.id}</span>
                </span>
                <span className="model-price">
                  {isExpensive(model) && (
                    <abbr className="expensive" title="Expensive: over $30 per million output tokens">
                      !
                    </abbr>
                  )}{' '}
                  {formatUsdPerMTok(model.inputUsdPerMTok)} in /{' '}
                  {formatUsdPerMTok(model.outputUsdPerMTok)} out
                </span>
              </label>
            </li>
          );
        })}
        {visible.length === 0 && <li className="empty">No models match "{query}"</li>}
      </ul>
    </fieldset>
  );
}
