import React, { useEffect, useState } from 'react';
import { Sheet, SheetBody, SheetHeader, Spinner } from '../../components/media/MediaUI';
import { LoadError } from '../../components/shared/PageBits';
import { StatusImage } from '../../components/shared/StatusImage';
import { fetchGroupCars, displayName, type GroupCar, type ModelGroupRow, type ModelGroupStats } from '../../lib/modelGroups';
import { CarStatusChip, UtilizationRing } from '../calendar/FleetParts';
import { LicensePlate } from '../bookings/ui';
import { GroupImage, GroupUtilizationRing } from './ModelGroupCard';

/** The group's cars: plate, today's status and the month's utilization. Read only. */
export const GroupCarsDrawer: React.FC<{
  group: ModelGroupRow;
  stats: ModelGroupStats | undefined;
  month: string;
  monthLabel: string;
  onClose: () => void;
}> = ({ group, stats, month, monthLabel, onClose }) => {
  const [cars, setCars] = useState<GroupCar[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const name = displayName(group);

  useEffect(() => {
    let active = true;
    setCars(null);
    setError(null);
    fetchGroupCars(group.id, month)
      .then((rows) => { if (active) setCars(rows); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [group.id, month, attempt]);

  const activeCars = cars?.filter((car) => car.isActive) ?? [];
  const inactiveCars = cars?.filter((car) => !car.isActive) ?? [];

  return (
    <Sheet open onClose={onClose} ariaLabel={`${name} cars`} maxWidthClass="sm:max-w-[520px]">
      <SheetHeader className="pe-14">
        <div className="flex items-center gap-3">
          <GroupImage src={group.image_url} alt="" className="!aspect-[4/3] w-20 shrink-0 !rounded-[10px]" />
          <div className="min-w-0">
            <h2 className="truncate text-[16px] font-semibold tracking-[-0.014em] text-foreground">{name}</h2>
            <p className="mt-0.5 text-[13px] text-black/50">
              {stats ? `${stats.rented_now} of ${stats.cars_active} active ${stats.cars_active === 1 ? 'car' : 'cars'} on the road now` : 'Cars in this group'}
            </p>
          </div>
          <div className="ms-auto flex flex-col items-center gap-0.5">
            <GroupUtilizationRing rate={stats?.utilization ?? null} size={44} />
            <span className="text-[11px] text-black/40">{monthLabel.split(' ')[0]}</span>
          </div>
        </div>
      </SheetHeader>
      <SheetBody>
        {error ? (
          <LoadError message={`Couldn't load the cars: ${error}`} onRetry={() => setAttempt((value) => value + 1)} />
        ) : cars === null ? (
          <div className="flex flex-1 items-center justify-center py-16" role="status" aria-label="Loading cars"><Spinner size={20} /></div>
        ) : cars.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-center">
            <StatusImage status="parking" size={96} />
            <p className="text-[14px] font-medium text-foreground">No cars in this group yet</p>
            <p className="max-w-[280px] text-[13px] text-black/50">Add a car on the Cars page and pick this model group.</p>
          </div>
        ) : (
          <>
            <CarList title={`Active · ${activeCars.length}`} cars={activeCars} monthLabel={monthLabel} />
            {inactiveCars.length > 0 && <CarList title={`Inactive · ${inactiveCars.length}`} cars={inactiveCars} monthLabel={monthLabel} muted />}
          </>
        )}
      </SheetBody>
    </Sheet>
  );
};

const CarList: React.FC<{ title: string; cars: GroupCar[]; monthLabel: string; muted?: boolean }> = ({ title, cars, monthLabel, muted }) => (
  <section>
    <h3 className="mb-2 text-[12.5px] font-medium text-black/50">{title}</h3>
    <ul className="overflow-hidden rounded-[14px] border border-subtle bg-surface">
      {cars.map((car, index) => (
        <li key={car.id} className={`flex min-h-[56px] items-center gap-3 px-3.5 py-2.5 ${index > 0 ? 'border-t border-black/[0.05]' : ''} ${muted ? 'opacity-60' : ''}`}>
          <LicensePlate plate={car.plate} className="[&>span:last-child]:text-[13px]" />
          {car.isActive ? <CarStatusChip status={car.status} /> : <span className="text-[12px] text-black/45">Not in service</span>}
          <span className="ms-auto flex items-center gap-2">
            <span className="hidden text-[11.5px] text-black/40 sm:inline">{monthLabel.split(' ')[0]}</span>
            <UtilizationRing value={car.utilization} />
          </span>
        </li>
      ))}
    </ul>
  </section>
);
