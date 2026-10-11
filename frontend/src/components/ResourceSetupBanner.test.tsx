import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ResourceSetupBanner } from './ResourceSetupBanner';

describe('ResourceSetupBanner', () => {
  it('renders nothing before the check has run', () => {
    const { container } = render(<ResourceSetupBanner missing={null} isSettingUp={false} onSetUp={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when no trustline is missing', () => {
    const { container } = render(<ResourceSetupBanner missing={[]} isSettingUp={false} onSetUp={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('names the resources the wallet cannot hold yet', () => {
    render(<ResourceSetupBanner missing={['IRON', 'PLSM']} isSettingUp={false} onSetUp={vi.fn()} />);

    expect(screen.getByText(/IRON, PLSM/)).toBeInTheDocument();
  });

  it('calls onSetUp when the button is clicked', () => {
    const onSetUp = vi.fn();
    render(<ResourceSetupBanner missing={['IRON']} isSettingUp={false} onSetUp={onSetUp} />);

    fireEvent.click(screen.getByRole('button', { name: /set up resources/i }));

    expect(onSetUp).toHaveBeenCalledTimes(1);
  });

  it('disables the button while setup is in progress, so it cannot be submitted twice', () => {
    const onSetUp = vi.fn();
    render(<ResourceSetupBanner missing={['IRON']} isSettingUp={true} onSetUp={onSetUp} />);

    const button = screen.getByRole('button', { name: /setting up/i });
    fireEvent.click(button);

    expect(button).toBeDisabled();
    expect(onSetUp).not.toHaveBeenCalled();
  });
});
