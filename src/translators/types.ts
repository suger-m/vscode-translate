export interface TranslationRequest {
  text: string;
  sourceLanguage: string;
}

export interface Translator {
  readonly label: string;
  translate(request: TranslationRequest): Promise<string>;
}

export class TranslationError extends Error {}
