import React, { useCallback, useEffect, useState } from 'react';

export const ONBOARDING_STORAGE_KEY = 'starbound:onboarding-dismissed';

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(4, 8, 16, 0.72)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: '1rem',
  },
  modal: {
    background: 'var(--bg-card, #0f1729)',
    border: '1px solid var(--border, #1e2a44)',
    borderRadius: '14px',
    padding: '2rem',
    maxWidth: '440px',
    width: '100%',
    boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
  },
  stepBadge: {
    display: 'inline-block',
    fontSize: '0.75rem',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--accent, #63b3ed)',
    marginBottom: '0.75rem',
  },
  title: {
    fontSize: '1.35rem',
    fontWeight: 700,
    color: 'var(--text, #e2e8f0)',
    marginBottom: '0.75rem',
    lineHeight: 1.3,
  },
  body: {
    fontSize: '0.95rem',
    color: 'var(--text-muted, #94a3b8)',
    lineHeight: 1.7,
    marginBottom: '1.75rem',
  },
  footer: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '1rem',
  },
  dots: {
    display: 'flex',
    gap: '0.4rem',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: 'var(--border, #1e2a44)',
  },
  dotActive: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: 'var(--accent, #63b3ed)',
  },
  buttonRow: {
    display: 'flex',
    gap: '0.6rem',
    alignItems: 'center',
  },
  buttonSecondary: {
    background: 'transparent',
    color: 'var(--text-muted, #94a3b8)',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.9rem',
    padding: '0.55rem 0.9rem',
    borderRadius: '8px',
    fontFamily: 'inherit',
  },
  buttonPrimary: {
    background: 'var(--accent, #63b3ed)',
    color: '#080b14',
    border: 'none',
    borderRadius: '8px',
    padding: '0.65rem 1.4rem',
    fontWeight: 700,
    fontSize: '0.95rem',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
};

export interface OnboardingStep {
  title: string;
  body: string;
}

/** The connect → trustlines → claim → build → mine loop, one step at a time. */
export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    title: 'Connect your wallet',
    body: 'Start by connecting Freighter. Your wallet is your account — no email, no server, no admin keys.',
  },
  {
    title: 'Set up your trustlines',
    body: 'Approve one transaction so your wallet can hold Iron, Energy, and Plasma. Without this you cannot receive mined resources.',
  },
  {
    title: 'Claim a star system',
    body: 'Pick an unclaimed cell on the galaxy map and claim it. The system’s resource production starts flowing to you immediately.',
  },
  {
    title: 'Build a fleet',
    body: 'Spend resources to build Scouts, Fighters, Cruisers, and Dreadnoughts. A fleet is what lets you take systems from other players.',
  },
  {
    title: 'Mine and conquer',
    body: 'Mine resources from the systems you own, move your fleet, and battle neighbors to expand. The whole loop lives on-chain.',
  },
];

export interface OnboardingModalProps {
  /** Steps to show; defaults to the full connect→trustlines→claim→build→mine loop. */
  steps?: OnboardingStep[];
  /** Storage backend — injectable so tests can mock `localStorage`. */
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
}

/** True when this browser has already dismissed the onboarding flow. */
export function hasDismissedOnboarding(
  storage: Pick<Storage, 'getItem'> = window.localStorage
): boolean {
  try {
    return storage.getItem(ONBOARDING_STORAGE_KEY) === 'true';
  } catch {
    // Private-mode browsers can throw on localStorage access.
    return false;
  }
}

/**
 * First-time-visitor onboarding (#138). Shown once per browser, tracked via
 * `localStorage`. Dismissing (any path) records the flag so the modal does
 * not reappear.
 */
export function OnboardingModal({ steps = ONBOARDING_STEPS, storage }: OnboardingModalProps) {
  const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
  const [visible, setVisible] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (!store) return;
    setVisible(!hasDismissedOnboarding(store));
  }, [store]);

  const dismiss = useCallback(() => {
    try {
      store?.setItem(ONBOARDING_STORAGE_KEY, 'true');
    } catch {
      // Ignore quota/private-mode failures — the modal just won't be remembered.
    }
    setVisible(false);
  }, [store]);

  if (!visible || steps.length === 0) {
    return null;
  }

  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;

  return (
    <div
      style={styles.overlay}
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) dismiss();
      }}
    >
      <div
        style={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        data-testid="onboarding-modal"
      >
        <span style={styles.stepBadge}>
          Step {stepIndex + 1} of {steps.length}
        </span>
        <h2 style={styles.title} id="onboarding-title">
          {step.title}
        </h2>
        <p style={styles.body}>{step.body}</p>

        <div style={styles.footer}>
          <div style={styles.dots} aria-hidden="true">
            {steps.map((_, i) => (
              <span key={i} style={i === stepIndex ? styles.dotActive : styles.dot} />
            ))}
          </div>
          <div style={styles.buttonRow}>
            <button type="button" style={styles.buttonSecondary} onClick={dismiss}>
              Skip
            </button>
            {stepIndex > 0 && (
              <button
                type="button"
                style={styles.buttonSecondary}
                onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
              >
                Back
              </button>
            )}
            <button
              type="button"
              style={styles.buttonPrimary}
              onClick={() => (isLast ? dismiss() : setStepIndex((i) => i + 1))}
            >
              {isLast ? 'Get started' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
