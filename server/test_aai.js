const { AssemblyAI } = require('assemblyai');
require('dotenv').config();

const client = new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY });
const transcriber = client.streaming.transcriber({
  speechModel: "universal-3-5-pro",
  sampleRate: 16000,
});

transcriber.on('open', () => console.log('Opened'));
transcriber.on('error', (err) => console.error('Error:', err.message));
transcriber.on('close', () => console.log('Closed'));

transcriber.connect().catch(err => console.error('Connect failed:', err.message));
