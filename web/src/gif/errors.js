export const MESSAGES = Object.freeze({
  INVALID_GIF: 'Please choose a valid GIF file.',
  CORRUPT_GIF: 'This GIF contains damaged or incomplete data. Please export it again.',
  INVALID_RESIZE: 'Enter a valid width and height for the resized GIF.',
  RESIZE_LIMIT: 'The resized GIF would exceed processing limits. Choose smaller dimensions.',
  UNSUPPORTED_RESIZE: 'This GIF could not be resized with its animation intact. Try another size or file.',
  UNSUPPORTED_CROP: 'This crop cannot preserve the colors and animation information. Try another selection or file.',
  RESOURCE_LIMIT: 'This GIF exceeds the current processing limits. Please use a smaller file.',
  TIMEOUT: 'Processing took too long and was stopped. Try a smaller file or retry.',
  UNSUPPORTED_ENV: 'This browser environment cannot run the tool. Please try desktop Chrome or Edge.',
  PROCESSING_FAILED: 'This GIF could not be processed. Please try another file.',
});

export class GifError extends Error {
  constructor(code, details) {
    super(MESSAGES[code] || MESSAGES.PROCESSING_FAILED);
    this.name = 'GifError';
    this.code = code;
    this.details = details;
  }
}

export function normalizeError(error) {
  if (error instanceof GifError) return error;
  const text = String(error?.message || error);
  const code = typeof WebAssembly !== 'undefined' && (error instanceof WebAssembly.CompileError || error instanceof WebAssembly.LinkError)
    ? 'UNSUPPORTED_ENV'
    : /out of memory|memory allocation|array buffer allocation|invalid (?:array|typed array) length/i.test(text)
      ? 'RESOURCE_LIMIT' : 'PROCESSING_FAILED';
  return new GifError(code, { reason: text });
}
