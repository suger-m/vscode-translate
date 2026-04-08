import * as vscode from 'vscode';
import * as https from 'node:https';

const COMMAND_ID = 'selection-translator.translateSelectionToChinese';
const COPY_COMMAND_ID = 'selection-translator.copyTranslation';
const REPLACE_COMMAND_ID = 'selection-translator.replaceSelectionWithTranslation';
const RETRY_COMMAND_ID = 'selection-translator.retryTranslation';
const MY_MEMORY_ENDPOINT = 'https://api.mymemory.translated.net/get';
const TARGET_LANGUAGE = 'zh-CN';
const MAX_PREVIEW_LENGTH = 280;
const REQUEST_TIMEOUT_MS = 10000;
const HOVER_SELECTOR: vscode.DocumentSelector = [{ scheme: 'file' }, { scheme: 'untitled' }];

export function activate(context: vscode.ExtensionContext) {
  const anchorDecoration = vscode.window.createTextEditorDecorationType({
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
    textDecoration: 'underline dotted',
    overviewRulerLane: vscode.OverviewRulerLane.Right
  });

  let hoverState: TranslationHoverState | undefined;
  let activeRequestId = 0;

  const clearHoverState = () => {
    hoverState = undefined;

    for (const editor of vscode.window.visibleTextEditors) {
      editor.setDecorations(anchorDecoration, []);
    }

    void vscode.commands.executeCommand('editor.action.hideHover');
  };

  const invalidateHoverState = () => {
    activeRequestId += 1;
    clearHoverState();
  };

  const showHoverCard = async (
    editor: vscode.TextEditor,
    state: TranslationHoverState
  ): Promise<void> => {
    hoverState = state;
    editor.setDecorations(anchorDecoration, [{ range: state.range }]);

    await vscode.commands.executeCommand('editor.action.hideHover');
    await delay(20);
    await vscode.commands.executeCommand('editor.action.showHover');
  };

  context.subscriptions.push(anchorDecoration);
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(HOVER_SELECTOR, {
      provideHover(document, position) {
        if (!hoverState || document.uri.toString() !== hoverState.documentUri) {
          return undefined;
        }

        if (!hoverState.range.contains(position)) {
          return undefined;
        }

        return new vscode.Hover(buildHoverContents(hoverState), hoverState.range);
      }
    })
  );
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((event) => {
      if (event.textEditor === vscode.window.activeTextEditor) {
        invalidateHoverState();
      }
    })
  );
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => {
      invalidateHoverState();
    })
  );
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (hoverState && event.document.uri.toString() === hoverState.documentUri) {
        invalidateHoverState();
      }
    })
  );

  const translateCommand = vscode.commands.registerCommand(COMMAND_ID, async () => {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
      await vscode.window.showInformationMessage('No active editor found.');
      return;
    }

    const selectedText = editor.document.getText(editor.selection).trim();

    if (!selectedText) {
      await vscode.window.showInformationMessage('Please select some text first.');
      return;
    }

    const selection = editor.selection;
    const requestId = ++activeRequestId;
    const sourceLanguage = getSourceLanguage();
    const stateBase = {
      documentUri: editor.document.uri.toString(),
      range: new vscode.Range(selection.start, selection.end),
      originalText: selectedText,
      sourceLanguage
    };

    await showHoverCard(editor, {
      ...stateBase,
      kind: 'loading'
    });

    try {
      const translation = await translateSelection(selectedText, sourceLanguage);

      if (!shouldRenderHover(requestId, activeRequestId, editor, selection)) {
        return;
      }

      await showHoverCard(editor, {
        ...stateBase,
        kind: 'success',
        translation
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Translation failed. Please try again later.';

      if (!shouldRenderHover(requestId, activeRequestId, editor, selection)) {
        return;
      }

      await showHoverCard(editor, {
        ...stateBase,
        kind: 'error',
        errorMessage: message
      });
    }
  });

  const copyCommand = vscode.commands.registerCommand(COPY_COMMAND_ID, async () => {
    if (!hoverState || hoverState.kind !== 'success') {
      return;
    }

    const translation = hoverState.translation;

    if (!translation) {
      return;
    }

    await vscode.env.clipboard.writeText(translation);
    vscode.window.setStatusBarMessage('Translation copied.', 1500);
  });

  const replaceCommand = vscode.commands.registerCommand(REPLACE_COMMAND_ID, async () => {
    if (!hoverState || hoverState.kind !== 'success') {
      return;
    }

    const editor = vscode.window.activeTextEditor;

    if (!editor || editor.document.uri.toString() !== hoverState.documentUri) {
      return;
    }

    const translation = hoverState.translation;
    const range = hoverState.range;

    if (!translation) {
      return;
    }

    await editor.edit((editBuilder) => {
      editBuilder.replace(range, translation);
    });

    clearHoverState();
  });

  const retryCommand = vscode.commands.registerCommand(RETRY_COMMAND_ID, async () => {
    if (!hoverState) {
      return;
    }

    const editor = vscode.window.activeTextEditor;
    const range = hoverState.range;
    const documentUri = hoverState.documentUri;

    if (!editor || editor.document.uri.toString() !== documentUri) {
      return;
    }

    editor.selection = new vscode.Selection(range.start, range.end);
    await vscode.commands.executeCommand(COMMAND_ID);
  });

  context.subscriptions.push(translateCommand, copyCommand, replaceCommand, retryCommand);
}

function getSourceLanguage(): string {
  const sourceLanguage = (
    vscode.workspace.getConfiguration('selectionTranslator').get<string>('sourceLanguage') || 'en'
  ).trim();

  if (!sourceLanguage) {
    throw new Error('Please configure selectionTranslator.sourceLanguage.');
  }

  return sourceLanguage;
}

async function translateSelection(text: string, sourceLanguage: string): Promise<string> {
  const contactEmail = (
    vscode.workspace.getConfiguration('selectionTranslator').get<string>('contactEmail') || ''
  ).trim();

  const url = new URL(MY_MEMORY_ENDPOINT);
  url.searchParams.set('q', text);
  url.searchParams.set('langpair', `${sourceLanguage}|${TARGET_LANGUAGE}`);

  if (contactEmail) {
    url.searchParams.set('de', contactEmail);
  }

  const response = await getJson<MyMemoryResponse>(url);
  const status = Number(response.responseStatus);
  const translatedText = response.responseData?.translatedText?.trim();

  if (response.quotaFinished) {
    throw new Error('Translation quota reached for the free MyMemory API.');
  }

  if (status !== 200 || !translatedText) {
    const details = response.responseDetails?.trim();
    throw new Error(details || 'Translation failed. The API did not return a result.');
  }

  return translatedText;
}

function getJson<T>(url: URL): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          'User-Agent': 'selection-translator/0.0.1'
        }
      },
      (response) => {
        const chunks: Buffer[] = [];

        response.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        response.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');

          try {
            resolve(JSON.parse(body) as T);
          } catch {
            reject(new Error('Failed to parse the translation API response.'));
          }
        });
      }
    );

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error('Translation request timed out. Please try again.'));
    });

    request.on('error', (error: Error) => {
      reject(error.message || 'Translation request failed. Check your network and try again.');
    });
  });
}

function shouldRenderHover(
  requestId: number,
  activeRequestId: number,
  editor: vscode.TextEditor,
  selection: vscode.Selection
): boolean {
  return (
    requestId === activeRequestId &&
    vscode.window.activeTextEditor === editor &&
    editor.selection.isEqual(selection)
  );
}

function buildHoverContents(state: TranslationHoverState): vscode.MarkdownString[] {
  const header = new vscode.MarkdownString(undefined, true);
  header.isTrusted = {
    enabledCommands: [COPY_COMMAND_ID, REPLACE_COMMAND_ID, RETRY_COMMAND_ID]
  };
  header.supportThemeIcons = true;
  header.appendMarkdown(
    `### $(globe) Translate To Chinese\n\n**From** \`${state.sourceLanguage}\`  -  **To** \`${TARGET_LANGUAGE}\``
  );

  if (state.kind === 'loading') {
    const loading = new vscode.MarkdownString(undefined, true);
    loading.supportThemeIcons = true;
    loading.appendMarkdown('---\n\n$(sync~spin) Translating the selected text...');
    return [header, loading];
  }

  if (state.kind === 'error') {
    const errorMessage = state.errorMessage || 'Translation failed.';
    const error = new vscode.MarkdownString(undefined, true);
    error.isTrusted = {
      enabledCommands: [RETRY_COMMAND_ID]
    };
    error.supportThemeIcons = true;
    error.appendMarkdown(
      `---\n\n$(error) **Translation failed**\n\n${escapeMarkdown(
        shortenForHover(errorMessage)
      )}\n\n[Retry](command:${RETRY_COMMAND_ID})`
    );
    return [header, error];
  }

  const translatedText = state.translation || '';
  const translation = new vscode.MarkdownString(undefined, true);
  translation.appendMarkdown('---\n\n**Chinese Translation**\n\n');
  translation.appendText(shortenForHover(translatedText));

  const original = new vscode.MarkdownString(undefined, true);
  original.appendMarkdown('\n\n**Original Text**\n\n');
  original.appendCodeblock(shortenForHover(state.originalText), 'text');

  const actions = new vscode.MarkdownString(undefined, true);
  actions.isTrusted = {
    enabledCommands: [COPY_COMMAND_ID, REPLACE_COMMAND_ID, RETRY_COMMAND_ID]
  };
  actions.supportThemeIcons = true;
  actions.appendMarkdown(
    '\n\n---\n\n[$(copy) Copy](command:' +
      COPY_COMMAND_ID +
      ')  |  [$(replace) Replace Selection](command:' +
      REPLACE_COMMAND_ID +
      ')  |  [$(refresh) Retry](command:' +
      RETRY_COMMAND_ID +
      ')'
  );

  return [header, translation, original, actions];
}

function shortenForHover(text: string): string {
  const normalized = text.replace(/\r\n/g, '\n').trim();

  if (normalized.length <= MAX_PREVIEW_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_PREVIEW_LENGTH - 3)}...`;
}

function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+\-.!|>]/g, '\\$&');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function deactivate() {}

interface TranslationHoverState {
  documentUri: string;
  range: vscode.Range;
  originalText: string;
  sourceLanguage: string;
  kind: 'loading' | 'success' | 'error';
  translation?: string;
  errorMessage?: string;
}

interface MyMemoryResponse {
  responseData?: {
    translatedText?: string;
    match?: number;
  };
  quotaFinished?: boolean;
  responseDetails?: string;
  responseStatus?: number | string;
}
