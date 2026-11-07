import React from 'react';
import { render, screen } from '@testing-library/react';
import BrandLogo from './BrandLogo';

describe('BrandLogo', () => {
  it('shows the lockup as one image: the icon, then the wordmark matched to it', () => {
    const { container } = render(<BrandLogo variant="lockup" size={32} />);
    const lockup = screen.getByRole('img', { name: 'Homesta Cars' });
    const [icon, wordmark] = Array.from(container.querySelectorAll('img'));
    expect(lockup).toHaveClass('flex-row');
    expect(icon).toHaveAttribute('src', '/brand/homesta-icon.png');
    expect(icon).toHaveStyle({ width: '32px', height: '32px' });
    expect(wordmark).toHaveAttribute('src', '/brand/homesta-wordmark-light.png');
    expect(wordmark).toHaveStyle({ height: '22px', width: `${Math.round(22 * 4000 / 1086)}px` });
  });

  it('stacks the lockup and takes the white wordmark on a dark surface', () => {
    const { container } = render(<BrandLogo variant="lockup" orientation="column" theme="dark" size={48} />);
    expect(screen.getByRole('img', { name: 'Homesta Cars' })).toHaveClass('flex-col');
    expect(container.querySelectorAll('img')[1]).toHaveAttribute('src', '/brand/homesta-wordmark-dark.png');
  });

  it('shows the icon alone at its size', () => {
    render(<BrandLogo variant="icon" size={32} />);
    expect(screen.getByRole('img', { name: 'Homesta Cars' })).toHaveStyle({ width: '32px', height: '32px' });
  });
});
