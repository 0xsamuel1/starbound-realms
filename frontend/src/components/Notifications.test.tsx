import React, { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NotificationProvider, useNotification } from './Notifications';

function Emitter({ initial }: { initial: string | null }) {
  const [message, setMessage] = useState<string | null>(initial);
  useNotification(message);
  return (
    <>
      <button onClick={() => setMessage(null)}>clear</button>
      <button onClick={() => setMessage('second error')}>change</button>
    </>
  );
}

function renderWithProvider(ui: React.ReactElement) {
  return render(<NotificationProvider>{ui}</NotificationProvider>);
}

describe('Notifications', () => {
  it('renders nothing when there is no message', () => {
    renderWithProvider(<Emitter initial={null} />);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a toast while a message is set', () => {
    renderWithProvider(<Emitter initial="something broke" />);

    expect(screen.getByRole('alert')).toHaveTextContent('something broke');
  });

  it('removes the toast when the message is cleared', () => {
    renderWithProvider(<Emitter initial="something broke" />);

    fireEvent.click(screen.getByText('clear'));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('replaces the toast when the message changes', () => {
    renderWithProvider(<Emitter initial="first error" />);

    fireEvent.click(screen.getByText('change'));

    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByRole('alert')).toHaveTextContent('second error');
  });

  it('lets the player dismiss a toast', () => {
    renderWithProvider(<Emitter initial="something broke" />);

    fireEvent.click(screen.getByLabelText('Dismiss notification'));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('stacks messages from multiple sources in one surface', () => {
    renderWithProvider(
      <>
        <Emitter initial="claim failed" />
        <Emitter initial="build failed" />
      </>
    );

    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(2);
    expect(alerts[0].parentElement).toBe(alerts[1].parentElement);
  });

  it('removes a toast when its source unmounts', () => {
    const { rerender } = renderWithProvider(<Emitter initial="something broke" />);

    rerender(<NotificationProvider>{null}</NotificationProvider>);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('throws a helpful error when used outside the provider', () => {
    const original = console.error;
    console.error = () => {};
    try {
      expect(() => render(<Emitter initial="x" />)).toThrow(/NotificationProvider/);
    } finally {
      console.error = original;
    }
  });
});
