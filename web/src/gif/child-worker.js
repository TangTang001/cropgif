// The main thread owns child workers so it can terminate them even if the
// processing worker is blocked. The GIF algorithm and child script are unchanged.
const children = new Map();
let sequence = 0;

export function createChildWorker(url) {
  const id = ++sequence;
  const child = {
    onmessage: null,
    onerror: null,
    postMessage(data) { self.postMessage({ child: { type: 'post', id, data } }); },
    terminate() { self.postMessage({ child: { type: 'terminate', id } }); children.delete(id); },
  };
  children.set(id, child);
  self.postMessage({ child: { type: 'create', id, url: String(url) } });
  return child;
}

export function handleChildMessage(data) {
  const child = children.get(data.id);
  if (!child) return;
  if (data.error) child.onerror?.({ message: data.error });
  else child.onmessage?.({ data: data.data });
}
