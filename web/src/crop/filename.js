export function cropFilename(name, width, height, shape) {
  let base = String(name || '').normalize('NFC').replace(/\.[^.]*$/, '')
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_').replace(/^[. ]+|[. ]+$/g, '');
  base = Array.from(base).slice(0, 72).join('').replace(/[. ]+$/g, '') || 'animation';
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(base)) base = `gif-${base}`;
  return `${base}-${shape === 'circle' ? 'circle-' : ''}crop-${width}x${height}.gif`;
}
