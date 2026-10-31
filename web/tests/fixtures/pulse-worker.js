const channel = new BroadcastChannel('gif-stage1-worker-termination');
setInterval(() => channel.postMessage('alive'), 20);
