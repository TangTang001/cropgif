const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// Store original-image integer pixels. CSS is only a projection.
export function imagePoint(clientX, clientY, bounds, image) {
  return { x: (clientX - bounds.left) * image.width / bounds.width, y: (clientY - bounds.top) * image.height / bounds.height };
}
export function move(rect, dx, dy, image) {
  return { ...rect, x: clamp(rect.x + Math.round(dx), 0, image.width - rect.width), y: clamp(rect.y + Math.round(dy), 0, image.height - rect.height) };
}
export function squareRect(rect) {
  const side = Math.min(rect.width, rect.height);
  return { x: rect.x + Math.round((rect.width - side) / 2), y: rect.y + Math.round((rect.height - side) / 2), width: side, height: side };
}
export function dimensions(rect, width, height, image) {
  return { x: Math.min(rect.x, image.width - width), y: Math.min(rect.y, image.height - height), width, height };
}
export function resize(rect, handle, dx, dy, image, square = false) {
  dx = Math.round(dx); dy = Math.round(dy);
  const west = handle.includes('w'), east = handle.includes('e');
  const north = handle.includes('n'), south = handle.includes('s');
  if (square) {
    // Corners anchor the opposite corner; sides anchor the opposite edge
    // and expand around the center of the other axis.
    const cx = rect.x + rect.width / 2, cy = rect.y + rect.height / 2;
    const ax = west ? rect.x + rect.width : rect.x, ay = north ? rect.y + rect.height : rect.y;
    const horizontal = west || east, vertical = north || south;
    const delta = horizontal && (!vertical || Math.abs(dx) >= Math.abs(dy)) ? (west ? -dx : dx) : (north ? -dy : dy);
    const maxWidth = horizontal ? (west ? ax : image.width - ax) : Math.floor(2 * Math.min(cx, image.width - cx));
    const maxHeight = vertical ? (north ? ay : image.height - ay) : Math.floor(2 * Math.min(cy, image.height - cy));
    const side = clamp(rect.width + delta, 1, Math.min(maxWidth, maxHeight));
    return { x: horizontal ? (west ? ax - side : ax) : clamp(Math.round(cx - side / 2), 0, image.width - side), y: vertical ? (north ? ay - side : ay) : clamp(Math.round(cy - side / 2), 0, image.height - side), width: side, height: side };
  }
  const left = west ? clamp(rect.x + dx, 0, rect.x + rect.width - 1) : rect.x;
  const right = east ? clamp(rect.x + rect.width + dx, left + 1, image.width) : rect.x + rect.width;
  const top = north ? clamp(rect.y + dy, 0, rect.y + rect.height - 1) : rect.y;
  const bottom = south ? clamp(rect.y + rect.height + dy, top + 1, image.height) : rect.y + rect.height;
  return { x: left, y: top, width: right - left, height: bottom - top };
}
