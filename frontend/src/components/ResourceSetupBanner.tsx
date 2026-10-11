const styles: Record<string, React.CSSProperties> = {
  banner: {
    background: 'var(--bg-card)',
    border: '1px solid var(--yellow)',
    borderRadius: '12px',
    padding: '1rem 1.25rem',
    marginBottom: '1rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '1rem',
    flexWrap: 'wrap',
  },
  text: {
    fontSize: '0.9rem',
    color: 'var(--text)',
    lineHeight: 1.5,
  },
  button: {
    background: 'var(--yellow)',
    color: '#080b14',
    border: 'none',
    borderRadius: '8px',
    padding: '0.6rem 1.2rem',
    fontWeight: 700,
    cursor: 'pointer',
  },
};

export interface ResourceSetupBannerProps {
  missing: string[] | null;
  isSettingUp: boolean;
  onSetUp: () => void;
}

/** Prompts a player whose wallet can't hold some resources yet to set up their trustlines. */
export function ResourceSetupBanner({ missing, isSettingUp, onSetUp }: ResourceSetupBannerProps) {
  if (!missing || missing.length === 0) {
    return null;
  }

  return (
    <div style={styles.banner}>
      <span style={styles.text}>
        Your wallet can't hold {missing.join(', ')} yet. Approve one transaction to set it up, so you can
        receive resources and build a fleet.
      </span>
      <button style={styles.button} onClick={onSetUp} disabled={isSettingUp}>
        {isSettingUp ? 'Setting up…' : 'Set up resources'}
      </button>
    </div>
  );
}
