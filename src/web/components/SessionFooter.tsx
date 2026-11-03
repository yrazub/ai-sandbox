import type { UsageResponse } from '../../shared/contracts';
import { formatUsageLine } from './usage-format';

type SessionFooterProps = {
  usage: UsageResponse | undefined;
  failed: boolean;
};

export function SessionFooter({ usage, failed }: SessionFooterProps) {
  let text = 'Session: loading…';
  if (failed) text = 'Session usage unavailable';
  else if (usage) text = formatUsageLine(usage);

  return (
    <footer className="session-footer">
      <p>{text}</p>
    </footer>
  );
}
