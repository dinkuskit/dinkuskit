import type { DeepChat } from 'deep-chat';
import { parseAnswer, parseConfig, plainChatText, unwrapped, type GuideConfig } from './contract.ts';

const errorMessages: Record<string, string> = {
  invalid_request: 'Please enter one question using the displayed limit.',
  too_large: 'That question is too long. Please shorten it.',
  overloaded: 'The guide is busy. Please try again shortly.',
  timeout: 'The guide took too long to answer. Please try again.',
  unavailable: 'The guide is unavailable right now. Please use the documentation links on this page.',
};

async function boundedJson(response: Response, maxBytes = 65536): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('unavailable');
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new Error('unavailable');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const all = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(all));
}

function endpoint(value: string | undefined): string {
  const url = new URL(value ?? '', window.location.href);
  if (!value?.startsWith('/') || value.startsWith('//') || url.origin !== window.location.origin || url.search || url.hash) throw new Error('unavailable');
  return url.pathname;
}

export function mountGuide(root: HTMLElement): void {
  if (root.dataset.mounted) return;
  root.dataset.mounted = 'true';
  const launch = root.querySelector<HTMLButtonElement>('.dinkusguide-launch')!;
  const dialog = root.querySelector<HTMLDialogElement>('dialog')!;
  const close = root.querySelector<HTMLButtonElement>('[data-guide-close]')!;
  const form = root.querySelector<HTMLFormElement>('form')!;
  const input = root.querySelector<HTMLTextAreaElement>('textarea')!;
  const submit = root.querySelector<HTMLButtonElement>('[data-guide-send]')!;
  const stop = root.querySelector<HTMLButtonElement>('[data-guide-stop]')!;
  const status = root.querySelector<HTMLElement>('[role="status"]')!;
  const container = root.querySelector<HTMLElement>('.dinkusguide-chat')!;
  const sources = root.querySelector<HTMLElement>('.dinkusguide-sources')!;
  let chat: DeepChat | undefined, config: GuideConfig | undefined, loading: Promise<void> | undefined;
  let controller: AbortController | undefined, answerCount = 0, busy = false;
  const setStatus = (message: string) => { status.textContent = message; };
  const setBusy = (value: boolean) => {
    busy = value; submit.disabled = value || !chat; input.disabled = value || !chat;
    stop.hidden = !value; container.setAttribute('aria-busy', String(value));
  };
  const end = () => {
    controller?.abort();
    if (dialog.open) dialog.close();
    launch.setAttribute('aria-expanded', 'false'); launch.focus();
  };
  close.addEventListener('click', end);
  stop.addEventListener('click', () => controller?.abort());
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); end(); });

  async function send() {
    if (!chat || !config || busy) return;
    const question = input.value;
    if (!question.trim()) { setStatus(errorMessages.invalid_request); return; }
    if ([...question].length > config.maxQuestionCharacters) { setStatus(errorMessages.too_large); return; }
    const active = new AbortController(); controller = active;
    setBusy(true); setStatus('Finding a source-backed answer…');
    chat.addMessage({ role: 'user', text: plainChatText(question) }); input.value = '';
    const deadline = setTimeout(() => active.abort('timeout'), config.timeoutMs);
    try {
      const response = await fetch(endpoint(root.dataset.askUrl), { method: 'POST', credentials: 'omit',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question }), signal: active.signal });
      const raw = await boundedJson(response);
      const failure = unwrapped(raw) as { error?: string } | null;
      if (!response.ok || failure?.error) throw new Error(failure?.error ?? 'unavailable');
      const answer = parseAnswer(raw);
      if (active.signal.aborted) return;
      chat.addMessage({ role: 'ai', text: plainChatText(answer.answer) }); answerCount++;
      if (answer.citations.length) {
        const details = document.createElement('details'); details.open = true;
        const summary = document.createElement('summary'); summary.textContent = `Sources for answer ${answerCount}`; details.append(summary);
        const list = document.createElement('ol');
        for (const url of answer.citations) {
          const item = document.createElement('li'), link = document.createElement('a');
          link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
          link.textContent = new URL(url).pathname.split('/').slice(2).join('/') + new URL(url).hash;
          item.append(link); list.append(item);
        }
        details.append(list); sources.append(details);
      }
      setStatus(answer.status === 'answered' ? 'Answer complete. Sources are listed below.' : 'The public documentation does not support an answer to this question.');
    } catch (error) {
      if (active.signal.aborted && active.signal.reason !== 'timeout') { setStatus('Question cancelled.'); return; }
      const code = active.signal.reason === 'timeout' ? 'timeout' : error instanceof Error ? error.message : 'unavailable';
      setStatus(errorMessages[code] ?? errorMessages.unavailable);
    } finally {
      clearTimeout(deadline); if (controller === active) controller = undefined;
      setBusy(false); if (dialog.open) input.focus();
    }
  }
  form.addEventListener('submit', (event) => { event.preventDefault(); void send(); });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); void send(); }
  });
  input.addEventListener('input', () => {
    if (config) setStatus(`${[...input.value].length} / ${config.maxQuestionCharacters} characters. Each question is independent.`);
  });

  async function initialize() {
    setStatus('Loading the guide…');
    const active = new AbortController(); controller = active;
    const deadline = setTimeout(() => active.abort(), 10000);
    try {
      const response = await fetch(endpoint(root.dataset.configUrl), { credentials: 'omit', signal: active.signal });
      if (!response.ok) throw new Error('unavailable');
      config = parseConfig(await boundedJson(response, 4096));
      if (!config.enabled) throw new Error('unavailable');
      await import('deep-chat');
      if (active.signal.aborted) return;
      chat = document.createElement('deep-chat');
      chat.remarkable = { html: false, applyHTML: false, breaks: true };
      // Deep Chat is only a local text renderer. Our form owns the exact ask payload.
      chat.connect = { handler: () => {} };
      chat.textInput = { disabled: true };
      chat.inputAreaStyle = { display: 'none' };
      chat.chatStyle = { display: 'block', boxSizing: 'border-box', width: '100%', height: '250px', border: '1px solid var(--line)', borderRadius: '10px', fontFamily: 'inherit', colorScheme: 'inherit', backgroundColor: 'var(--surface)', color: 'var(--ink)' };
      chat.messageStyles = { default: { ai: { bubble: { backgroundColor: 'var(--accent-wash)', color: 'var(--ink)', border: '1px solid var(--accent-line)' } }, user: { bubble: { backgroundColor: 'var(--graphite)', color: 'var(--graphite-ink)', borderLeft: '3px solid var(--focus)' } } } };
      chat.maxVisibleMessages = 40;
      chat.onComponentRender = () => { setBusy(false); if (dialog.open) input.focus(); };
      container.append(chat);
      setStatus(`Up to ${config.maxQuestionCharacters} characters per question. Each question is independent.`);
    } finally { clearTimeout(deadline); if (controller === active) controller = undefined; }
  }

  launch.addEventListener('click', async () => {
    if (!dialog.open) dialog.showModal(); launch.setAttribute('aria-expanded', 'true'); close.focus();
    try {
      if (!chat) { loading ??= initialize().finally(() => { loading = undefined; }); await loading; }
      else input.focus();
    } catch { setStatus(errorMessages.unavailable); }
  });
}
