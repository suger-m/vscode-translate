import * as vscode from 'vscode';
import { LruCache, makeCacheKey } from './cache';
import { PanelAction, ResultPanelProvider } from './panel/resultPanel';
import { isLlmConfigured, loadConfig, TranslatorConfig } from './settings';
import { LlmTranslator } from './translators/llm';
import { MyMemoryTranslator } from './translators/mymemory';
import { TranslationError, Translator } from './translators/types';

const COMMAND_ID = 'selection-translator.translateSelectionToChinese';
const SIDEBAR_FOCUS_COMMAND = 'workbench.view.extension.selection-translator';
const CACHE_CAPACITY = 100;

interface PositionDto {
  line: number;
  character: number;
}

interface ActiveJob {
  documentUri: string;
  rangeStart: PositionDto;
  rangeEnd: PositionDto;
  text: string;
  sourceLanguage: string;
  translation?: string;
}

export function activate(context: vscode.ExtensionContext): void {
  const cache = new LruCache<string>(CACHE_CAPACITY);
  const version = (context.extension.packageJSON as { version?: string }).version ?? 'dev';
  let job: ActiveJob | undefined;

  const panel = new ResultPanelProvider(handleAction);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ResultPanelProvider.viewType, panel),
    vscode.commands.registerCommand(COMMAND_ID, () => runTranslation())
  );

  async function handleAction(action: PanelAction): Promise<void> {
    if (action === 'copy') {
      if (job?.translation) {
        await vscode.env.clipboard.writeText(job.translation);
        vscode.window.setStatusBarMessage('已复制译文。', 1500);
      }
      return;
    }

    if (action === 'replace') {
      await replaceSelection();
      return;
    }

    if (action === 'openSettings') {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'selectionTranslator');
      return;
    }

    await runTranslation({ force: true });
  }

  async function replaceSelection(): Promise<void> {
    const current = job;
    if (!current?.translation) {
      return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.toString() !== current.documentUri) {
      vscode.window.showWarningMessage('找不到原文所在的文档，请重新选中文本并翻译。');
      return;
    }

    const range = toRange(current);
    const document = editor.document;

    if (
      range.start.line > document.lineCount - 1 ||
      range.end.line > document.lineCount - 1 ||
      document.getText(range).trim() !== current.text
    ) {
      vscode.window.showWarningMessage('原文已发生变化，请重新翻译。');
      return;
    }

    await editor.edit((editBuilder) => {
      editBuilder.replace(range, current.translation as string);
    });
    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(range);
    vscode.window.setStatusBarMessage('已用译文替换选区。', 1500);

    job = undefined;
    panel.update({ kind: 'idle' });
  }

  async function runTranslation(options: { force?: boolean } = {}): Promise<void> {
    let editor: vscode.TextEditor;
    let text: string;

    if (options.force && job) {
      // 重试：复用保存的原文，而不是当前选区
      const savedJob = job;
      const doc = vscode.workspace.textDocuments.find(
        (d) => d.uri.toString() === savedJob.documentUri
      );
      if (!doc) {
        vscode.window.showWarningMessage('原文所在的文档已关闭，请重新选中文本并翻译。');
        return;
      }

      const visible = vscode.window.visibleTextEditors.find((e) => e.document === doc);
      editor = visible ?? (await vscode.window.showTextDocument(doc));

      const range = toRange(savedJob);
      if (
        range.start.line > doc.lineCount - 1 ||
        range.end.line > doc.lineCount - 1 ||
        doc.getText(range).trim() !== savedJob.text
      ) {
        vscode.window.showWarningMessage('原文已发生变化，请重新选中文本并翻译。');
        return;
      }

      editor.selection = new vscode.Selection(range.start, range.end);
      text = savedJob.text;
    } else {
      const active = vscode.window.activeTextEditor;
      if (!active) {
        await vscode.window.showInformationMessage('未找到活动编辑器。');
        return;
      }

      const selection = active.selection;
      text = active.document.getText(selection).trim();
      if (!text) {
        await vscode.window.showInformationMessage('请先选中要翻译的文本。');
        return;
      }
      editor = active;
    }

    const config = loadConfig();
    const currentJob: ActiveJob =
      options.force && job ? (job as ActiveJob) : {
        documentUri: editor.document.uri.toString(),
        rangeStart: { line: editor.selection.start.line, character: editor.selection.start.character },
        rangeEnd: { line: editor.selection.end.line, character: editor.selection.end.character },
        text,
        sourceLanguage: config.sourceLanguage
      };
    job = currentJob;

    const translator = createTranslator(config, version);
    await vscode.commands.executeCommand(SIDEBAR_FOCUS_COMMAND);
    panel.update({
      kind: 'loading',
      providerLabel: translator.label,
      originalText: text,
      sourceLanguage: config.sourceLanguage
    });

    try {
      const key = makeCacheKey({
        provider: translator.label,
        prompt: config.llm.prompt,
        sourceLanguage: config.sourceLanguage,
        text
      });

      let translation = options.force ? undefined : cache.get(key);
      let fromCache = false;

      if (translation) {
        fromCache = true;
      } else {
        translation = await translator.translate({
          text,
          sourceLanguage: config.sourceLanguage
        });
        cache.set(key, translation);
      }

      job.translation = translation;
      panel.update({
        kind: 'success',
        providerLabel: translator.label,
        originalText: text,
        translation,
        sourceLanguage: config.sourceLanguage,
        fromCache
      });
    } catch (error) {
      panel.update({
        kind: 'error',
        providerLabel: translator.label,
        error: toMessage(error)
      });
    }
  }
}

function createTranslator(config: TranslatorConfig, version: string): Translator {
  const useLlm =
    config.provider === 'llm' || (config.provider === 'auto' && isLlmConfigured(config));

  if (useLlm) {
    return new LlmTranslator({
      baseUrl: config.llm.baseUrl,
      model: config.llm.model,
      apiKey: config.llm.apiKey,
      apiKeyEnvVar: config.llm.apiKeyEnvVar,
      prompt: config.llm.prompt,
      timeoutMs: config.llm.timeoutMs
    });
  }

  return new MyMemoryTranslator({
    sourceLanguage: config.sourceLanguage,
    contactEmail: config.myMemory.contactEmail,
    userAgent: `selection-translator/${version}`
  });
}

function toRange(job: ActiveJob): vscode.Range {
  return new vscode.Range(
    new vscode.Position(job.rangeStart.line, job.rangeStart.character),
    new vscode.Position(job.rangeEnd.line, job.rangeEnd.character)
  );
}

function toMessage(error: unknown): string {
  if (error instanceof TranslationError) {
    return error.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return '翻译失败，请稍后重试。';
}

export function deactivate(): void {}
