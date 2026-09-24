import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';
import { TARGET_LANGUAGE_LABEL } from '../constants';

export type PanelAction = 'copy' | 'replace' | 'retry' | 'openSettings';

export type PanelState =
  | { kind: 'idle' }
  | {
      kind: 'loading';
      providerLabel?: string;
      originalText?: string;
      sourceLanguage?: string;
    }
  | {
      kind: 'success';
      providerLabel: string;
      originalText: string;
      translation: string;
      sourceLanguage: string;
      fromCache?: boolean;
    }
  | { kind: 'error'; providerLabel?: string; error: string };

export class ResultPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'selectionTranslator.result';

  private view: vscode.WebviewView | undefined;
  private state: PanelState = { kind: 'idle' };

  constructor(private readonly onAction: (action: PanelAction) => void) {}

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = renderHtml(this.state, createNonce());

    webviewView.webview.onDidReceiveMessage((message: unknown) => {
      if (message && typeof message === 'object' && 'action' in message) {
        const action = (message as { action: unknown }).action;
        if (
          action === 'copy' ||
          action === 'replace' ||
          action === 'retry' ||
          action === 'openSettings'
        ) {
          void this.onAction(action);
        }
      }
    });

    webviewView.onDidDispose(() => {
      if (this.view === webviewView) {
        this.view = undefined;
      }
    });
  }

  public update(state: PanelState): void {
    this.state = state;
    if (this.view) {
      this.view.webview.html = renderHtml(state, createNonce());
    }
  }
}

function createNonce(): string {
  return randomBytes(16).toString('hex');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function subtitle(state: PanelState): string {
  if (state.kind === 'success' || state.kind === 'loading') {
    const parts = [`${state.sourceLanguage} → ${TARGET_LANGUAGE_LABEL}`];
    if (state.providerLabel) {
      parts.push(state.providerLabel);
    }
    return parts.join(' · ');
  }
  return state.kind === 'error' ? state.providerLabel ?? '' : '';
}

function cacheBadge(state: PanelState): string {
  return state.kind === 'success' && state.fromCache ? '<span class="badge">缓存</span>' : '';
}

function originalDetails(text?: string): string {
  if (!text) {
    return '';
  }
  return `<details class="original"><summary>原文</summary><pre>${escapeHtml(text)}</pre></details>`;
}

function globeIcon(): string {
  return `<svg class="globe" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
    <circle cx="12" cy="12" r="8.5"/>
    <ellipse cx="12" cy="12" rx="3.8" ry="8.5"/>
    <line x1="3.5" y1="12" x2="20.5" y2="12"/>
  </svg>`;
}

function renderBody(state: PanelState): string {
  switch (state.kind) {
    case 'idle':
      return `<div class="empty">
        ${globeIcon()}
        <div class="hint">在编辑器中选中文字，右键选择「翻译选中内容为中文」，译文会显示在这里。</div>
      </div>`;

    case 'loading':
      return [
        `<div class="card"><span class="spinner"></span>正在翻译…</div>`,
        originalDetails(state.originalText)
      ].join('');

    case 'error':
      return [
        `<div class="card error-card"><div class="error">${escapeHtml(state.error)}</div></div>`,
        `<div class="actions">`,
        `<button data-action="retry">重试</button>`,
        `<button class="secondary" data-action="openSettings">检查设置</button>`,
        `</div>`
      ].join('');

    case 'success':
      return [
        `<div class="card"><div class="label">译文</div><pre class="translation">${escapeHtml(
          state.translation
        )}</pre></div>`,
        originalDetails(state.originalText),
        `<div class="actions">`,
        `<button data-action="copy">复制译文</button>`,
        `<button class="secondary" data-action="replace">替换选区</button>`,
        `<button class="ghost" data-action="retry">重试</button>`,
        `</div>`
      ].join('');
  }
}

function renderHtml(state: PanelState, nonce: string): string {
  const sub = subtitle(state);
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    padding: 12px;
  }
  body > * { animation: fadeIn 0.18s ease; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: none; } }
  .header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 10px;
  }
  .title { font-weight: 600; }
  .subtitle {
    color: var(--vscode-descriptionForeground);
    font-size: 0.8em;
    margin-top: 2px;
  }
  .badge {
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    border-radius: 10px;
    padding: 1px 8px;
    font-size: 0.75em;
    white-space: nowrap;
  }
  .card {
    border: 1px solid var(--vscode-widget-border);
    background: var(--vscode-editorWidget-background);
    border-radius: 6px;
    padding: 10px 12px;
    margin-bottom: 10px;
  }
  .label {
    color: var(--vscode-descriptionForeground);
    font-size: 0.8em;
    margin-bottom: 4px;
  }
  pre {
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
  }
  .translation { font-size: 1.05em; line-height: 1.55; }
  .hint, .label, summary { color: var(--vscode-descriptionForeground); }
  .error { color: var(--vscode-errorForeground); }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 2px; }
  button {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    border-radius: 3px;
    padding: 4px 12px;
    font-size: 0.88em;
    cursor: pointer;
  }
  button:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
  button:disabled { opacity: 0.7; cursor: default; }
  button.secondary {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }
  button.secondary:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground); }
  button.ghost {
    background: transparent;
    color: var(--vscode-foreground);
    border: 1px solid var(--vscode-widget-border);
  }
  button.ghost:hover:not(:disabled) { background: var(--vscode-toolbar-hoverBackground); }
  .spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    margin-right: 6px;
    vertical-align: -2px;
    border: 2px solid var(--vscode-descriptionForeground);
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  details.original { margin-top: 10px; font-size: 0.9em; }
  details.original pre { margin-top: 4px; }
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 28px 10px;
    text-align: center;
  }
  .globe { width: 40px; height: 40px; opacity: 0.55; }
  .empty .hint { max-width: 220px; line-height: 1.5; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="title">翻译结果</div>
      ${sub ? `<div class="subtitle">${escapeHtml(sub)}</div>` : ''}
    </div>
    ${cacheBadge(state)}
  </div>
  ${renderBody(state)}
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.querySelectorAll('button[data-action]').forEach((button) => {
      if (button.dataset.action === 'copy') {
        button.addEventListener('click', () => {
          vscode.postMessage({ type: 'action', action: 'copy' });
          button.textContent = '已复制';
          button.disabled = true;
          setTimeout(() => {
            button.textContent = '复制译文';
            button.disabled = false;
          }, 1200);
        });
        return;
      }
      button.addEventListener('click', () => {
        vscode.postMessage({ type: 'action', action: button.dataset.action });
      });
    });
  </script>
</body>
</html>`;
}
