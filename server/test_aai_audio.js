const WebSocket = require('ws');
const querystring = require('querystring');
require('dotenv').config();

const API_KEY = process.env.ASSEMBLYAI_API_KEY;
const SAMPLE_RATE = 44100;
const params = { speech_model: "universal-3-5-pro", sample_rate: SAMPLE_RATE };
const endpoint = `wss://streaming.assemblyai.com/v3/ws?${querystring.stringify(params)}`;

const ws = new WebSocket(endpoint, { headers: { Authorization: API_KEY } });

ws.on('open', () => {
  console.log('Opened');
  
  // Generate a 1-second 440Hz sine wave (beep) at 44100Hz
  const samples = 44100;
  const buffer = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    const val = Math.sin(2 * Math.PI * 440 * i / 44100);
    const pcm = val < 0 ? val * 0x8000 : val * 0x7FFF;
    buffer.writeInt16LE(pcm, i * 2);
  }
  
  // Send in chunks
  let offset = 0;
  const interval = setInterval(() => {
    if (offset >= buffer.length) {
      clearInterval(interval);
      ws.send(JSON.stringify({ type: 'Terminate' }));
      return;
    }
    const chunk = buffer.slice(offset, offset + 8192);
    ws.send(chunk);
    offset += 8192;
  }, 92);
});

ws.on('message', (data) => console.log('Msg:', data.toString()));
ws.on('close', () => console.log('Closed'));
