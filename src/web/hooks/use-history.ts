import { useState } from 'react';
import { readHistory, saveEntry, type HistoryEntry, type HistoryRead } from '../lib/history-storage';

export function useHistory() {
  const [history, setHistory] = useState<HistoryRead>(() => readHistory());
  const [saveFailed, setSaveFailed] = useState(false);

  function record(entry: HistoryEntry) {
    const outcome = saveEntry(entry);
    if (outcome === 'unavailable') {
      setHistory({ status: 'unavailable' });
      setSaveFailed(false);
      return;
    }
    setHistory(readHistory());
    setSaveFailed(outcome === 'not-saved');
  }

  function resetSaveFailed() {
    setSaveFailed(false);
  }

  return { history, saveFailed, record, resetSaveFailed };
}
