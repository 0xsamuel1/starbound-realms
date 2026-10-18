export interface LoadingIndicatorProps {
  label?: string;
}

/** Shared visual and assistive loading status for asynchronous sections. */
export function LoadingIndicator({ label = 'Loading…' }: LoadingIndicatorProps) {
  return (
    <div className="loading-indicator" role="status" aria-live="polite" aria-label={label}>
      <span className="loading-indicator__spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
