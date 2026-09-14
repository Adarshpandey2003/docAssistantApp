// mammoth ships no types for its prebuilt browser bundle, which is the only
// build that works under Hermes (the default entry reaches for `fs`).
declare module 'mammoth/mammoth.browser' {
  export interface ConvertMessage {
    type: 'warning' | 'error';
    message: string;
  }

  export interface ConvertResult {
    value: string;
    messages: ConvertMessage[];
  }

  export interface ConvertInput {
    arrayBuffer: ArrayBuffer;
  }

  export interface ConvertOptions {
    styleMap?: string | string[];
    includeDefaultStyleMap?: boolean;
    convertImage?: unknown;
    ignoreEmptyParagraphs?: boolean;
  }

  export function convertToHtml(
    input: ConvertInput,
    options?: ConvertOptions
  ): Promise<ConvertResult>;

  export function extractRawText(input: ConvertInput): Promise<ConvertResult>;
}
