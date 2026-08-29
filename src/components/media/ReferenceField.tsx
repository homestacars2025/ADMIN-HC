import React from 'react';
import { ExternalLink } from './MediaIcons';
import { Input, Label } from './MediaUI';

/**
 * The Reference URL input, shared by the Idea and Post sheets so both read
 * identically.
 *
 * The helper line **states what will be stored** rather than rejecting the input:
 * typing `instagram.com/x` is a perfectly reasonable thing to do, so the field
 * shows the `https://` it will add instead of marking the value invalid. The same
 * rule is applied again on the server, so the inline editor and every other write
 * path store one shape.
 */
export const ReferenceField: React.FC<{
  value: string;
  onChange: (next: string) => void;
  label?: string;
}> = ({ value, onChange, label = 'Reference' }) => {
  const raw = value.trim();
  const willPrefix = raw.length > 0 && !/^https?:\/\//i.test(raw);
  const href = willPrefix ? `https://${raw}` : raw;

  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="url"
          inputMode="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://instagram.com/…"
        />
        {raw && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open the ${label.toLowerCase()} link in a new tab`}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-black/[0.08] text-black/45 transition-colors hover:bg-black/[0.03] hover:text-black/70"
          >
            <ExternalLink size={14} strokeWidth={1.75} />
          </a>
        )}
      </div>
      <p className="text-[11.5px] text-black/35">
        {willPrefix
          ? `Saved as https://${raw}`
          : 'Optional — the trend, post, or example this is based on.'}
      </p>
    </div>
  );
};
