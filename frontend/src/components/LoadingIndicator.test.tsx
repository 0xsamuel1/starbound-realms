import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LoadingIndicator } from './LoadingIndicator';

describe('LoadingIndicator', () => {
  it('announces its visible label as a status', () => {
    render(<LoadingIndicator label="Loading fleet…" />);

    expect(screen.getByRole('status')).toHaveAccessibleName('Loading fleet…');
    expect(screen.getByText('Loading fleet…')).toBeInTheDocument();
  });
});
