// Copies a one-time secret (such as a new store key) for the person looking at it.
// The secret is only ever handed to the clipboard or selected on the page; it is never
// logged, reported or sent anywhere, and failures report only a fixed reason.

export type CopyOutcome = 'copied' | 'copied_fallback' | 'select_manually';

export interface CopyEnvironment {
  /** navigator.clipboard when present. */
  clipboard?: { writeText(text: string): Promise<void> } | null;
  /** window.isSecureContext; the async clipboard only works in secure contexts. */
  isSecureContext?: boolean;
  /** Copies through a temporary textarea and execCommand('copy'); true when it worked. */
  legacyCopy?: (text: string) => boolean;
}

export async function copySecret(text: string, env: CopyEnvironment): Promise<CopyOutcome> {
  if (env.clipboard && typeof env.clipboard.writeText === 'function' && env.isSecureContext !== false) {
    try {
      await env.clipboard.writeText(text);
      return 'copied';
    } catch {
      // Permission refused or document not focused: fall through to the fallback.
    }
  }
  try {
    if (env.legacyCopy?.(text)) return 'copied_fallback';
  } catch {
    // execCommand can throw in some browsers; the person can still copy by hand.
  }
  return 'select_manually';
}

export const COPY_MESSAGE: Record<CopyOutcome, string> = {
  copied: 'Copied.',
  copied_fallback: 'Copied.',
  select_manually: "Couldn't copy automatically. The key is selected; press Ctrl+C (or Command+C) to copy it.",
};

/** Browser fallback: copy through a temporary, off-screen textarea. */
export function textareaCopy(doc: Document): (text: string) => boolean {
  return text => {
    const area = doc.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.setAttribute('aria-hidden', 'true');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.opacity = '0';
    doc.body.appendChild(area);
    try {
      area.select();
      return typeof doc.execCommand === 'function' && doc.execCommand('copy');
    } finally {
      area.remove();
    }
  };
}

function selectContents(doc: Document, element: Element) {
  const selection = doc.getSelection?.();
  if (!selection) return;
  const range = doc.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * Wires every [data-copy-target] button under root. The button names the id of the
 * element holding the secret and the id of an aria-live element for the result.
 */
export function wireCopyButtons(root: ParentNode, doc: Document, win: { navigator: Navigator; isSecureContext: boolean }) {
  root.querySelectorAll<HTMLButtonElement>('button[data-copy-target]').forEach(button => {
    if (button.dataset.copyWired === '1') return;
    button.dataset.copyWired = '1';
    button.hidden = false;
    button.addEventListener('click', async () => {
      const source = doc.getElementById(button.dataset.copyTarget ?? '');
      const status = doc.getElementById(button.dataset.copyStatus ?? '');
      if (!source) return;
      const outcome = await copySecret(source.textContent ?? '', {
        clipboard: win.navigator.clipboard ?? null,
        isSecureContext: win.isSecureContext,
        legacyCopy: textareaCopy(doc),
      });
      if (outcome === 'select_manually') selectContents(doc, source);
      if (status) {
        status.textContent = COPY_MESSAGE[outcome];
        status.classList.toggle('account-error', outcome === 'select_manually');
      }
    });
  });
}
