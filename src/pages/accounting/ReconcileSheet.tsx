import React, { useMemo, useState } from 'react';
import { Button, Select, Sheet, SheetBody, SheetDescription, SheetFooter, SheetHeader, SheetTitle, Spinner } from '../../components/media/MediaUI';
import {
  CAR_SHEET_CATEGORIES,
  carCategoryFor,
  COMPANY_EXPENSE_CATEGORIES,
  companyCategoryFor,
  defaultTarget,
  type PostTarget,
  type ReconcileChoice,
  type ReviewExpense,
} from '../../lib/expenseApprovals';
import type { FineCar } from '../../lib/fines';
import { formatMoney } from '../../lib/money';
import { CarPicker } from '../bookings/CarPicker';
import { Field, INPUT, Notice, Segmented } from '../bookings/ui';

const TARGETS = [
  { value: 'car', label: 'Car sheet' },
  { value: 'company', label: 'Company expenses' },
  { value: 'other', label: 'Other' },
] as const;

const CAR_OPTIONS = CAR_SHEET_CATEGORIES.map((value) => ({ value, label: value }));
const COMPANY_OPTIONS = COMPANY_EXPENSE_CATEGORIES.map(({ value, label }) => ({ value, label }));

export const ReconcileSheet: React.FC<{
  row: ReviewExpense;
  cars: FineCar[];
  onClose: () => void;
  onConfirm: (choice: ReconcileChoice) => Promise<void>;
}> = ({ row, cars, onClose, onConfirm }) => {
  const [target, setTarget] = useState<PostTarget>(defaultTarget(row));
  const [carId, setCarId] = useState(row.car_id ? String(row.car_id) : '');
  const [carCategory, setCarCategory] = useState(carCategoryFor(row.category));
  const [companyCategory, setCompanyCategory] = useState(companyCategoryFor(row.category));
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [carError, setCarError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choices = useMemo(() => cars.filter((car) => !car.inactive || car.id === row.car_id), [cars, row.car_id]);
  const plate = cars.find((car) => String(car.id) === carId)?.plate_number;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (target === 'car' && !carId) { setCarError('Choose a car.'); return; }
    setSaving(true);
    setError(null);
    try {
      await onConfirm({
        target,
        carId: target === 'car' ? Number(carId) : null,
        category: target === 'car' ? carCategory : target === 'company' ? companyCategory : null,
        note: note.trim() || null,
      });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Try again.');
      setSaving(false);
    }
  };

  return (
    <Sheet open onClose={onClose} ariaLabel="Reconcile expense" maxWidthClass="sm:max-w-[480px]">
      <form onSubmit={submit} className="flex h-full min-h-0 flex-col">
        <SheetHeader>
          <SheetTitle>Reconcile {formatMoney(row.amount)}</SheetTitle>
          <SheetDescription>{row.description || row.category || 'Expense'}</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <Field label="Destination">
            <Segmented ariaLabel="Destination" value={target} options={TARGETS} onChange={setTarget} />
          </Field>

          {target === 'car' && (
            <>
              <CarPicker label="Car" required cars={choices} value={carId} error={carError} onChange={(id) => { setCarId(id); setCarError(null); }} />
              <Field label="Category">
                <Select value={carCategory} options={CAR_OPTIONS} size="lg" ariaLabel="Category" onChange={setCarCategory} />
              </Field>
            </>
          )}
          {target === 'company' && (
            <Field label="Category">
              <Select value={companyCategory} options={COMPANY_OPTIONS} size="lg" ariaLabel="Category" onChange={setCompanyCategory} />
            </Field>
          )}

          <Field label="Note">
            <input className={INPUT} value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>

          <Notice tone="blue">
            {target === 'car' && (plate ? `Posts to the car sheet of ${plate}.` : 'Choose the car to post it to.')}
            {target === 'company' && 'Posts to Company expenses.'}
            {target === 'other' && "Nothing is posted to a sheet. It only counts as approved."}
            {row.supplier ? ` Also goes on the sheet of ${row.supplier}.` : ''}
          </Notice>
          {error && <Notice tone="red">{error}</Notice>}
        </SheetBody>
        <SheetFooter>
          <Button type="button" variant="outline" size="lg" className="!h-11 md:!h-10" disabled={saving} onClick={onClose}>Cancel</Button>
          <Button type="submit" size="lg" className="!h-11 px-4 md:!h-10" disabled={saving}>
            {saving && <Spinner size={13} />} Reconcile
          </Button>
        </SheetFooter>
      </form>
    </Sheet>
  );
};
