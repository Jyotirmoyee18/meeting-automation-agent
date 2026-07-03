const WebSocket = require("ws");
const querystring = require("querystring");
require("dotenv").config();

const API_KEY = process.env.ASSEMBLYAI_API_KEY;
const SAMPLE_RATE = 44100; // Testing with 44100
const params = { speech_model: "universal-3-5-pro", sample_rate: SAMPLE_RATE };
const endpoint = `wss://streaming.assemblyai.com/v3/ws?${querystring.stringify(params)}`;

console.log("Connecting to", endpoint);
const ws = new WebSocket(endpoint, { headers: { Authorization: API_KEY } });

ws.on("open", () => {
  console.log("Direct WS Opened");
  const buffer = Buffer.alloc(44100 * 2); 
  ws.send(buffer);
  
  setTimeout(() => {
    ws.send(JSON.stringify({ type: "Terminate" }));
  }, 3000);
});

ws.on("error", (err) => console.error("Direct WS Error:", err.message));
ws.on("close", (code, reason) => console.log("Direct WS Closed:", code, reason.toString()));
ws.on("message", (msg) => console.log("Direct WS Msg:", msg.toString()));
