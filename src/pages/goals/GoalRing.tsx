import React, { useEffect, useState } from 'react';
import {
  STATUS_COLORS,
  STATUS_LABELS,
  goalValueText,
  ringFraction,
  type GoalProgress,
} from '../../lib/goals';

/** A single progress ring, filling on load. The fill stops for reduced-motion users. */
export const GoalRing: React.FC<{
  goal: GoalProgress;
  size?: number;
  strokeWidth?: number;
  showValue?: boolean;
}> = ({ goal, size = 96, strokeWidth = 9, showValue = true }) => {
  const [filled, setFilled] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setFilled(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - (filled ? ringFraction(goal) : 0));
  const value = goalValueText(goal);

  return (
    <div
      role="img"
      aria-label={`${goal.label_en}: ${value}, ${STATUS_LABELS[goal.status]}`}
      title={`${goal.label_en}: ${value} · ${STATUS_LABELS[goal.status]}`}
      className="relative shrink-0"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#EFEFEF" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={STATUS_COLORS[goal.status]}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700 ease-out motion-reduce:transition-none"
        />
      </svg>
      {showValue && (
        <span
          className="absolute inset-0 grid place-items-center font-semibold tabular-nums text-foreground"
          style={{ fontSize: Math.max(10, Math.round(size * 0.22)) }}
        >
          {value}
        </span>
      )}
    </div>
  );
};
