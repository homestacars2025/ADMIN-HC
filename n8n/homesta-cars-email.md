# n8n — "Homesta Cars — Email (Resend inbound + outbound)"

Workflow id `XJTB5UF90xpLJu1A` on `n8n-n8n.gdsddq.easypanel.host`.

n8n is not in this repo and the MCP connector for it is read-only, so these two
node bodies are kept here as the source of truth. **Paste them into n8n by hand
after changing them here.**

Two mailboxes now exist in `email_accounts`: `homestacars-partners`
(partners@, B2B platforms) and `homestacars-info` (info@, `is_default`).

---

## 1. "Normalize Inbound" (Code node)

`ingest_inbound_email` picks the account by matching the recipient against
`email_accounts.email_address`, falling back to `p_account_slug` and then to the
default. So the slug below is **only a fallback** — it must stay, but it no
longer decides anything on its own.

What actually needed fixing: the recipient list was passed through raw. Resend
sends `to` entries as `"Homesta Partners <partners@homestacars.com>"` as often
as a bare address, and the function matches with
`lower(email_address) = lower(trim(v_to))` — a display name makes that match
fail, and the mail silently lands in info@. `addr()` below strips it.

```js
// Resend sends email.received. Normalise it into ingest_inbound_email's shape.
// Payload: { type:'email.received', data:{ from, to, subject, headers, text, html, ... } }

// A recipient may arrive as "Name <a@b.com>", as "a@b.com", or as { email }.
// The DB matches the account on an exact address, so the display name has to go
// or partner mail resolves to the default mailbox instead.
const addr = (v) => {
  if (!v) return '';
  const raw = typeof v === 'string' ? v : (v.email || v.address || '');
  const m = /<([^>]+)>/.exec(raw);
  return (m ? m[1] : raw).trim().toLowerCase();
};
const addrList = (v) => (Array.isArray(v) ? v : v ? [v] : []).map(addr).filter(Boolean);

const out = [];
for (const item of $input.all()) {
  const body = item.json.body || item.json;
  if (body.type && body.type !== 'email.received') { continue; }
  const d = body.data || body;

  let fromEmail = addr(d.from), fromName = '';
  if (typeof d.from === 'string') {
    const m = /"?([^"<]*)"?\s*</.exec(d.from);
    if (m) fromName = (m[1] || '').trim();
  } else if (d.from && d.from.name) {
    fromName = d.from.name;
  }

  const toArr = addrList(d.to);
  const ccArr = addrList(d.cc);

  let messageId = d.message_id || d.messageId || null;
  let inReplyTo = d.in_reply_to || null;
  if (Array.isArray(d.headers)) {
    for (const h of d.headers) {
      const nm = (h.name || '').toLowerCase();
      if (nm === 'message-id' && !messageId) messageId = h.value;
      if (nm === 'in-reply-to' && !inReplyTo) inReplyTo = h.value;
    }
  }

  out.push({ json: {
    // Fallback only. The DB resolves the account from to_emails first; this is
    // what it lands on when a message arrives with no recognisable recipient.
    account_slug: 'homestacars-info',
    message_id: messageId,
    in_reply_to: inReplyTo,
    from_email: fromEmail,
    from_name: fromName,
    to_emails: toArr,
    cc_emails: ccArr,
    subject: d.subject || '(بدون عنوان)',
    body_text: d.text || '',
    body_html: d.html || '',
    email_date: d.created_at || d.date || new Date().toISOString(),
    has_attachments: Array.isArray(d.attachments) && d.attachments.length > 0,
    attachments: Array.isArray(d.attachments)
      ? JSON.stringify(d.attachments.map(a => ({ name: a.filename || a.name, type: a.content_type || a.type })))
      : null
  }});
}
return out;
```

---

## 2. "Send via Resend API" (HTTP Request node → JSON body)

The `send-email` Edge Function now resolves the mailbox itself and forwards
`from_email` / `from_name` / `account_slug`. The env vars stay as the fallback,
so this node keeps working if an older caller omits them.

```
={
  "from": "{{ $json.body.from_name || $env.HCARS_EMAIL_FROM_NAME }} <{{ $json.body.from_email || $env.HCARS_EMAIL_FROM }}>",
  "to": {{ JSON.stringify(($json.body.to || '').split(',').map(s=>s.trim()).filter(Boolean)) }},
  "subject": {{ JSON.stringify($json.body.subject) }},
  "html": {{ JSON.stringify($json.body.body_html) }},
  "reply_to": "{{ $json.body.from_email || $env.HCARS_EMAIL_FROM }}"
}
```

Resend sends from any address on a verified domain, so partners@ needs no DNS
of its own.

---

## Known gaps, not changed here

- **Cc is dropped on send.** The dashboard collects it and the Edge Function
  forwards it, but this node has never put it in the Resend body. Fixing it
  means confirming Resend tolerates an empty `cc` array, so it is left alone
  rather than guessed at.
- **"Store in Cars DB" has the Supabase service-role key pasted into its header
  parameters** instead of an env var or credential. Anyone who can read the
  workflow can read the key. Move it to `$env.HCARS_SUPABASE_SERVICE_KEY` — the
  "Mark Sent in DB" node in the same workflow already does exactly that — and
  rotate the key, since the pasted one should now be treated as exposed.
