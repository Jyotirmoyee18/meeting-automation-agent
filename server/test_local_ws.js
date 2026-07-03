const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:3001/ws');

ws.on('open', () => {
  console.log('Connected to local backend');
  ws.send(JSON.stringify({
    type: 'meeting:start',
    meetingId: 'test-meeting-id2',
    title: 'Test 2',
    sampleRate: 44100
  }));
  
  // send mock audio matching frontend: 4096 samples (8192 bytes)
  setInterval(() => {
    ws.send(Buffer.alloc(8192));
  }, 92); // 4096 / 44100 = 92.8 ms
});

ws.on('message', (data) => {
  console.log('Message from backend:', data.toString());
});

ws.on('close', () => {
  console.log('Local WS closed');
  process.exit(0);
});
