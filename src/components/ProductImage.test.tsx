import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProductImage } from './ProductImage';

describe('ProductImage', () => {
  it('shows a graceful fallback when an image fails to load', () => {
    render(<ProductImage src="https://example.com/missing.jpg" alt="Oak chair" />);

    fireEvent.error(screen.getByRole('img', { name: 'Oak chair' }));

    expect(screen.getByRole('img', { name: 'Oak chair image unavailable' })).toHaveTextContent('Image unavailable');
    expect(screen.queryByRole('img', { name: 'Oak chair' })).not.toBeInTheDocument();
  });
});
