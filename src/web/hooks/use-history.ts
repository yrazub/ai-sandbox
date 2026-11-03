import { useEffect, useState } from 'react';
import {
  HISTORY_KEY,
  clearHistory,
  deleteEntry,
  readHistory,
  saveEntry,
  type HistoryEntry,
  type HistoryRead,
} from '../lib/history-storage';

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

  function remove(id: string) {
    setHistory(deleteEntry(id) === 'unavailable' ? { status: 'unavailable' } : readHistory());
  }

  function clear() {
    setHistory(clearHistory() === 'unavailable' ? { status: 'unavailable' } : readHistory());
  }

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === HISTORY_KEY || event.key === null) setHistory(readHistory());
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  function resetSaveFailed() {
    setSaveFailed(false);
  }

  return { history, saveFailed, record, remove, clear, resetSaveFailed };
}
