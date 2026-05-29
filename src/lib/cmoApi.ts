// CMO webhook integration — sends messages to the n8n CMO workflow.
//
// n8n handles: reading context from DB, calling Claude, saving the response
// to social.sm_chat_with_cmo, and returning the response in the HTTP body.
// The frontend real-time subscription picks up the saved response automatically.

const WEBHOOK_URL = process.env.REACT_APP_N8N_CMO_WEBHOOK_URL;
const TIMEOUT_MS = 60_000; // Claude can take a while

export interface CMOResponse {
  success: boolean;
  response: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
  };
  /** Discriminated error type for UX-specific handling */
  errorKind?: 'timeout' | 'network' | 'server' | 'not_configured';
}

/**
 * POST a user message to the n8n CMO webhook.
 * n8n saves the CMO reply to the DB — do NOT save it from the frontend.
 */
export async function sendMessageToCMO(
  message: string,
  messageId: string,
  profileId: string,
): Promise<CMOResponse> {
  if (!WEBHOOK_URL) {
    console.error('[CMO API] REACT_APP_N8N_CMO_WEBHOOK_URL is not set');
    return { success: false, response: '', errorKind: 'not_configured' };
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, message_id: messageId, profile_id: profileId }),
      signal: controller.signal,
    });

    clearTimeout(timeoutHandle);

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[CMO API] HTTP ${res.status} — ${body}`);
      return { success: false, response: '', errorKind: 'server' };
    }

    const data: { response?: string; message?: string; usage?: CMOResponse['usage'] } =
      await res.json();

    return {
      success: true,
      response: data.response ?? data.message ?? '',
      usage: data.usage,
    };
  } catch (err) {
    clearTimeout(timeoutHandle);
    if (err instanceof Error && err.name === 'AbortError') {
      console.error('[CMO API] Request timed out after 60 s');
      return { success: false, response: '', errorKind: 'timeout' };
    }
    console.error('[CMO API] Network error:', err);
    return { success: false, response: '', errorKind: 'network' };
  }
}

/** Returns true when the webhook URL is configured (env var is set). */
export function isCmoConfigured(): boolean {
  return Boolean(WEBHOOK_URL);
}
