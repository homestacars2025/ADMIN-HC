import React from 'react';
import { FUEL_RANGE_LABEL, FUEL_RANGE_PLACEHOLDER, fuelRangeDigits } from '../../lib/fuelRange';

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'>;

const NOT_A_DIGIT = ['-', '+', '.', ',', 'e', 'E'];

/** The one way fuel gets entered. Callers pass the style of the km field beside it. */
export const FuelRangeInput: React.FC<InputProps & { value: string; onChange: (value: string) => void }> = ({ value, onChange, ...rest }) => (
  <input
    {...rest}
    type="number"
    inputMode="numeric"
    min="0"
    step="1"
    aria-label={FUEL_RANGE_LABEL}
    placeholder={FUEL_RANGE_PLACEHOLDER}
    value={value}
    onKeyDown={(event) => { if (NOT_A_DIGIT.includes(event.key)) event.preventDefault(); }}
    onChange={(event) => onChange(fuelRangeDigits(event.target.value))}
  />
);
