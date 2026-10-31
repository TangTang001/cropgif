// Controlled infinite task with a child worker: tests termination of the whole tree.
self.onmessage = () => {
  self.postMessage({ child: { type: 'create', id: 1, url: new URL('/tests/fixtures/pulse-worker.js', self.location.href).href } });
  setTimeout(() => { while (true) { /* deliberately blocked */ } }, 50);
};
