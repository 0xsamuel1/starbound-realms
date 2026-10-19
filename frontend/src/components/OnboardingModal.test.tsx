import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  OnboardingModal,
  ONBOARDING_STEPS,
  ONBOARDING_STORAGE_KEY,
  hasDismissedOnboarding,
} from './OnboardingModal';

/** Minimal in-memory stand-in for `localStorage`. */
function createMemoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    get length() {
      return map.size;
    },
    data: map,
  };
}

const CUSTOM_STEPS = [
  { title: 'One', body: 'First step' },
  { title: 'Two', body: 'Second step' },
];

describe('OnboardingModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the modal for a brand-new visitor', () => {
    render(<OnboardingModal steps={CUSTOM_STEPS} storage={createMemoryStorage()} />);

    expect(screen.getByTestId('onboarding-modal')).toBeInTheDocument();
    expect(screen.getByText('One')).toBeInTheDocument();
  });

  it('does not reappear after dismissal', () => {
    const storage = createMemoryStorage();
    const { unmount } = render(<OnboardingModal steps={CUSTOM_STEPS} storage={storage} />);

    fireEvent.click(screen.getByRole('button', { name: /skip/i }));
    unmount();

    expect(storage.getItem(ONBOARDING_STORAGE_KEY)).toBe('true');
    render(<OnboardingModal steps={CUSTOM_STEPS} storage={storage} />);
    expect(screen.queryByTestId('onboarding-modal')).not.toBeInTheDocument();
  });

  it('does not show for a returning visitor who already dismissed it', () => {
    const storage = createMemoryStorage({ [ONBOARDING_STORAGE_KEY]: 'true' });

    render(<OnboardingModal steps={CUSTOM_STEPS} storage={storage} />);

    expect(screen.queryByTestId('onboarding-modal')).not.toBeInTheDocument();
  });

  it('walks through the connect → trustlines → claim → build → mine loop', () => {
    render(<OnboardingModal storage={createMemoryStorage()} />);

    const titles = ONBOARDING_STEPS.map((s) => s.title);
    for (let i = 0; i < titles.length; i++) {
      expect(screen.getByText(titles[i])).toBeInTheDocument();
      if (i < titles.length - 1) {
        fireEvent.click(screen.getByRole('button', { name: /next/i }));
      }
    }

    // The loop is exactly the five steps the issue asks for.
    expect(titles).toEqual([
      'Connect your wallet',
      'Set up your trustlines',
      'Claim a star system',
      'Build a fleet',
      'Mine and conquer',
    ]);
    expect(screen.getByRole('button', { name: /get started/i })).toBeInTheDocument();
  });

  it('dismisses when Get started is pressed on the last step', () => {
    const storage = createMemoryStorage();
    render(<OnboardingModal steps={CUSTOM_STEPS} storage={storage} />);

    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    fireEvent.click(screen.getByRole('button', { name: /get started/i }));

    expect(screen.queryByTestId('onboarding-modal')).not.toBeInTheDocument();
    expect(storage.getItem(ONBOARDING_STORAGE_KEY)).toBe('true');
  });

  it('supports going back a step', () => {
    render(<OnboardingModal steps={CUSTOM_STEPS} storage={createMemoryStorage()} />);

    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText('Two')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByText('One')).toBeInTheDocument();
  });
});

describe('hasDismissedOnboarding', () => {
  it('returns false when the flag is absent', () => {
    expect(hasDismissedOnboarding(createMemoryStorage())).toBe(false);
  });

  it('returns true when the flag is set', () => {
    expect(
      hasDismissedOnboarding(createMemoryStorage({ [ONBOARDING_STORAGE_KEY]: 'true' }))
    ).toBe(true);
  });

  it('returns false when storage access throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
    };
    expect(hasDismissedOnboarding(broken)).toBe(false);
  });
});
