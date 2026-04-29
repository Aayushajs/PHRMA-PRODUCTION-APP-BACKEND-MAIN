declare module '@development-team/bg-remover' {
  import { RequestHandler } from 'express';

  interface RemoveBgOptions {
    replaceOriginal?: boolean;
    fieldName?: string;
    timeout?: number;
    retries?: number;
  }

  interface OcrMiddlewareOptions {
    stream?: boolean;
    apiUrl?: string;
    wsUrl?: string;
    fieldName?: string;
    timeout?: number;
    retries?: number;
  }

  export function removeBgMiddleware(options?: RemoveBgOptions): RequestHandler;
  export function ocrMiddleware(options?: OcrMiddlewareOptions): RequestHandler;
  // Legacy aliases
  export const ocrStreamHandler: (options?: OcrMiddlewareOptions) => RequestHandler;
  export const ocrRestMiddleware: (options?: OcrMiddlewareOptions) => RequestHandler;
}
