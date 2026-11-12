import React, { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/media/badgeColor';
import { escapeHtml } from '../../lib/mailThreads';
import {
  BoldIcon,
  ClearFormatIcon,
  ItalicIcon,
  LinkIcon,
  ListBulletIcon,
  ListNumberIcon,
  QuoteIcon,
  UnderlineIcon,
} from './mailIcons';

/**
 * A small rich-text editor that writes HTML.
 *
 * contentEditable plus the browser's own formatting commands: no editor library
 * for a toolbar this size. It is uncontrolled — `initialHtml` is read once, and
 * every edit is reported through `onChange`. What it produces is sanitised again
 * before it is sent, so nothing pasted in can ride along.
 */

type Command = 'bold' | 'italic' | 'underline' | 'insertUnorderedList' | 'insertOrderedList' | 'removeFormat';

const TOOLS: Array<{ command: Command | 'quote'; label: string; Icon: React.FC<{ size?: number }> }> = [
  { command: 'bold', label: 'Bold', Icon: BoldIcon },
  { command: 'italic', label: 'Italic', Icon: ItalicIcon },
  { command: 'underline', label: 'Underline', Icon: UnderlineIcon },
  { command: 'insertUnorderedList', label: 'Bulleted list', Icon: ListBulletIcon },
  { command: 'insertOrderedList', label: 'Numbered list', Icon: ListNumberIcon },
  { command: 'quote', label: 'Quote', Icon: QuoteIcon },
  { command: 'removeFormat', label: 'Clear formatting', Icon: ClearFormatIcon },
];

const TOOL_BUTTON = 'grid h-9 w-9 place-items-center rounded-md text-black/55 transition-colors hover:bg-black/[0.05] hover:text-black/85 md:h-8 md:w-8';

export const RichEditor: React.FC<{
  initialHtml: string;
  onChange: (html: string) => void;
  placeholder?: string;
  ariaLabel: string;
  /** Focus with the caret at the start, above any quoted text. */
  autoFocus?: boolean;
}> = ({ initialHtml, onChange, placeholder, ariaLabel, autoFocus }) => {
  const ref = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const [empty, setEmpty] = useState(!initialHtml);
  const [linking, setLinking] = useState(false);
  const [linkUrl, setLinkUrl] = useState('https://');

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = initialHtml || '<p><br></p>';
    setEmpty(!el.textContent?.trim());
    if (autoFocus) {
      el.focus();
      const range = document.createRange();
      range.setStart(el, 0);
      range.collapse(true);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    // Read once: the editor owns its content from here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const report = () => {
    const el = ref.current;
    if (!el) return;
    setEmpty(!el.textContent?.trim() && !el.querySelector('img'));
    onChange(el.innerHTML);
  };

  const run = (command: Command | 'quote') => {
    ref.current?.focus();
    if (command === 'quote') document.execCommand('formatBlock', false, 'blockquote');
    else document.execCommand(command, false);
    report();
  };

  const startLink = () => {
    const selection = window.getSelection();
    savedRange.current = selection && selection.rangeCount > 0 ? selection.getRangeAt(0).cloneRange() : null;
    setLinkUrl('https://');
    setLinking(true);
  };

  const applyLink = () => {
    const url = linkUrl.trim();
    setLinking(false);
    if (!/^(https?:\/\/|mailto:)/i.test(url)) return;
    ref.current?.focus();
    const selection = window.getSelection();
    if (savedRange.current && selection) {
      selection.removeAllRanges();
      selection.addRange(savedRange.current);
    }
    if (selection && !selection.isCollapsed) document.execCommand('createLink', false, url);
    else {
      const safe = escapeHtml(url);
      document.execCommand('insertHTML', false, `<a href="${safe}">${safe}</a>&nbsp;`);
    }
    report();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-input focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/20">
      <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5 border-b border-black/[0.06] px-1.5 py-1">
        {TOOLS.map(({ command, label, Icon }) => (
          <button
            key={command}
            type="button"
            title={label}
            aria-label={label}
            // Keep the selection in the editor while the button is pressed.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => run(command)}
            className={TOOL_BUTTON}
          >
            <Icon size={15} />
          </button>
        ))}
        <button
          type="button"
          title="Link"
          aria-label="Insert link"
          onMouseDown={(event) => event.preventDefault()}
          onClick={startLink}
          className={TOOL_BUTTON}
        >
          <LinkIcon size={15} />
        </button>
        {linking && (
          <div className="flex min-w-0 flex-1 items-center gap-1.5 ps-1">
            <input
              autoFocus
              value={linkUrl}
              onChange={(event) => setLinkUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') { event.preventDefault(); applyLink(); }
                if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setLinking(false); }
              }}
              aria-label="Link address"
              className="h-8 min-w-0 flex-1 rounded-md border border-input px-2 text-[12.5px] outline-none focus:border-primary"
            />
            <button type="button" onClick={applyLink} className="h-8 rounded-md px-2.5 text-[12.5px] font-medium text-brand-strong hover:bg-primary/10">Add</button>
          </div>
        )}
      </div>
      <div className="relative min-h-[220px] flex-1">
        {empty && placeholder && (
          <div aria-hidden="true" className="pointer-events-none absolute left-4 top-3 text-[14px] text-black/30">{placeholder}</div>
        )}
        <div
          ref={ref}
          role="textbox"
          aria-multiline="true"
          aria-label={ariaLabel}
          contentEditable
          suppressContentEditableWarning
          dir="auto"
          onInput={report}
          onBlur={report}
          className={cn(
            'mail-editor h-full min-h-[220px] overflow-y-auto px-4 py-3 text-[14px] leading-[1.65] text-foreground outline-none',
            '[&_blockquote]:ms-1 [&_blockquote]:border-s-2 [&_blockquote]:border-black/15 [&_blockquote]:ps-3 [&_blockquote]:text-black/60',
            '[&_ul]:list-disc [&_ul]:ps-6 [&_ol]:list-decimal [&_ol]:ps-6 [&_a]:text-brand-strong [&_a]:underline [&_p]:min-h-[1em]',
          )}
        />
      </div>
    </div>
  );
};
