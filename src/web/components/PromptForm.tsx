import type { FormEvent, ReactNode, Ref } from 'react';
import { MAX_PROMPT_CHARS } from '../../shared/contracts';

interface Props {
  prompt: string;
  onPromptChange: (prompt: string) => void;
  canRun: boolean;
  running: boolean;
  onRun: () => void;
  textareaRef?: Ref<HTMLTextAreaElement>;
  /** The model picker sits between the prompt and the Run button. */
  children: ReactNode;
}

export function PromptForm({ prompt, onPromptChange, canRun, running, onRun, textareaRef, children }: Props) {
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (canRun) onRun();
  }

  return (
    <form className="prompt-form" onSubmit={handleSubmit}>
      <label htmlFor="prompt">Prompt</label>
      <textarea
        id="prompt"
        ref={textareaRef}
        value={prompt}
        maxLength={MAX_PROMPT_CHARS}
        rows={5}
        onChange={(event) => onPromptChange(event.target.value)}
      />
      {children}
      <button type="submit" className="run-button" disabled={!canRun}>
        {running ? 'Running…' : 'Run'}
      </button>
    </form>
  );
}
