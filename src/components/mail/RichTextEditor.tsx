import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { cn } from '../../lib/media/badgeColor';
import { escapeHtml } from '../../lib/mailThreads';
import { sanitizeOutgoingHtml } from '../../lib/sanitizeEmail';
import {
  BoldIcon,
  ClearFormatIcon,
  ItalicIcon,
  LinkIcon,
  ListBulletIcon,
  ListNumberIcon,
  QuoteIcon,
  UnderlineIcon,
} from './MailIcons';

/**
 * A small rich-text editor that writes HTML.
 *
 * Built on contentEditable and the browser's own editing commands rather than a
 * library: a mail composer needs bold, lists, links and quotes, and every
 * browser still implements those commands. What leaves it is always run
 * through `sanitizeOutgoingHtml`, so pasted Word or web markup is reduced to
 * plain formatting before it can reach a recipient.
 */

export interface RichTextEditorHandle {
  focus: () => void;
  getHtml: () => string;
}

interface Props {
  initialHtml?: string;
  placeholder?: string;
  ariaLabel: string;
  onChange?: (html: string) => void;
  /** Cmd/Ctrl+Enter. */
  onSubmit?: () => void;
  className?: string;
}

type Command = 'bold' | 'italic' | 'underline' | 'insertUnorderedList' | 'insertOrderedList';

const TOOLS: Array<{ cmd: Command; label: string; Icon: React.FC<{ size?: number }>; shortcut?: string }> = [
  { cmd: 'bold', label: 'Bold', Icon: BoldIcon, shortcut: 'B' },
  { cmd: 'italic', label: 'Italic', Icon: ItalicIcon, shortcut: 'I' },
  { cmd: 'underline', label: 'Underline', Icon: UnderlineIcon, shortcut: 'U' },
  { cmd: 'insertUnorderedList', label: 'Bulleted list', Icon: ListBulletIcon },
  { cmd: 'insertOrderedList', label: 'Numbered list', Icon: ListNumberIcon },
];

function exec(command: string, value?: string): void {
  // execCommand is deprecated but universally implemented, and there is no
  // replacement for editing a contentEditable region.
  document.execCommand(command, false, value);
}

const RichTextEditor = React.forwardRef<RichTextEditorHandle, Props>(
  ({ initialHtml = '', placeholder, ariaLabel, onChange, onSubmit, className }, ref) => {
    const area = useRef<HTMLDivElement>(null);
    const [empty, setEmpty] = useState(!initialHtml);
    const [active, setActive] = useState<Record<string, boolean>>({});

    useImperativeHandle(ref, () => ({
      focus: () => area.current?.focus(),
      getHtml: () => sanitizeOutgoingHtml(area.current?.innerHTML ?? ''),
    }), []);

    // Set once: React must not own the children of a contentEditable.
    useEffect(() => {
      if (area.current) area.current.innerHTML = sanitizeOutgoingHtml(initialHtml);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const refreshState = useCallback(() => {
      const el = area.current;
      if (!el) return;
      setEmpty((el.textContent ?? '').trim() === '' && !el.querySelector('img,li'));
      const next: Record<string, boolean> = {};
      for (const t of TOOLS) {
        try { next[t.cmd] = document.queryCommandState(t.cmd); } catch { next[t.cmd] = false; }
      }
      setActive(next);
    }, []);

    const emit = useCallback(() => {
      refreshState();
      onChange?.(area.current?.innerHTML ?? '');
    }, [onChange, refreshState]);

    const run = (cmd: string, value?: string) => {
      area.current?.focus();
      exec(cmd, value);
      emit();
    };

    const addLink = () => {
      const selection = window.getSelection();
      const hasText = selection && !selection.isCollapsed;
      const raw = window.prompt('Link address', 'https://');
      if (!raw || raw === 'https://') return;
      const url = /^(https?:|mailto:)/i.test(raw) ? raw : `https://${raw}`;
      area.current?.focus();
      if (hasText) exec('createLink', url);
      else exec('insertHTML', `<a href="${escapeHtml(url)}">${escapeHtml(raw)}</a>`);
      emit();
    };

    const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
      const html = e.clipboardData.getData('text/html');
      const text = e.clipboardData.getData('text/plain');
      if (!html && !text) return;
      e.preventDefault();
      if (html) exec('insertHTML', sanitizeOutgoingHtml(html));
      else exec('insertText', text);
      emit();
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        onSubmit?.();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        addLink();
      }
    };

    const btn = 'grid h-8 w-8 place-items-center rounded-md text-black/55 transition-colors hover:bg-black/[0.05] hover:text-black/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35';

    return (
      <div className={cn('flex min-h-0 flex-col rounded-xl border border-border bg-background focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/15', className)}>
        <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5 border-b border-black/[0.06] px-1.5 py-1">
          {TOOLS.map(({ cmd, label, Icon, shortcut }) => (
            <button
              key={cmd}
              type="button"
              title={shortcut ? `${label} (⌘${shortcut})` : label}
              aria-label={label}
              aria-pressed={Boolean(active[cmd])}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => run(cmd)}
              className={cn(btn, active[cmd] && 'bg-primary/10 text-brand-hover')}
            >
              <Icon size={15} />
            </button>
          ))}
          <span aria-hidden="true" className="mx-1 h-4 w-px bg-black/10" />
          <button type="button" title="Link (⌘K)" aria-label="Insert link" onMouseDown={(e) => e.preventDefault()} onClick={addLink} className={btn}>
            <LinkIcon size={15} />
          </button>
          <button type="button" title="Quote" aria-label="Quote" onMouseDown={(e) => e.preventDefault()} onClick={() => run('formatBlock', 'blockquote')} className={btn}>
            <QuoteIcon size={15} />
          </button>
          <button
            type="button"
            title="Clear formatting"
            aria-label="Clear formatting"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { run('removeFormat'); run('formatBlock', 'div'); }}
            className={btn}
          >
            <ClearFormatIcon size={15} />
          </button>
        </div>
        <div className="relative min-h-0 flex-1">
          {empty && placeholder && (
            <div aria-hidden="true" className="pointer-events-none absolute left-3.5 top-3 text-[14px] text-black/30">
              {placeholder}
            </div>
          )}
          <div
            ref={area}
            role="textbox"
            aria-multiline="true"
            aria-label={ariaLabel}
            contentEditable
            suppressContentEditableWarning
            dir="auto"
            onInput={emit}
            onKeyUp={refreshState}
            onMouseUp={refreshState}
            onPaste={onPaste}
            onKeyDown={onKeyDown}
            className={cn(
              'mail-editor h-full min-h-[220px] overflow-y-auto px-3.5 py-3 text-[14px] leading-[1.6] text-foreground outline-none',
              '[&_a]:text-brand-hover [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-black/15 [&_blockquote]:pl-3 [&_blockquote]:text-black/60',
              '[&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6',
            )}
          />
        </div>
      </div>
    );
  },
);
RichTextEditor.displayName = 'RichTextEditor';

export default RichTextEditor;
