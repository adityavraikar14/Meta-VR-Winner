// Dev tool: send one raw command to the IWER emulator in the managed browser,
// including methods the iwsdk CLI does not expose (e.g. set_hand_pose).
//
//   node scripts/emu.mjs set_hand_pose '{"device":"hand-right","poseId":"peace"}'
//   node scripts/emu.mjs eval '"__shadowplay.state()"'   (see below)
import { readFileSync } from 'node:fs';
import WebSocket from 'ws';

const [method, rawParams = '{}'] = process.argv.slice(2);
if (!method) {
  console.error('usage: node scripts/emu.mjs <method> [json-params]');
  process.exit(1);
}
const session = JSON.parse(readFileSync('.iwsdk/runtime/session.json', 'utf8'));
const id = `emu-${Date.now()}`;
const ws = new WebSocket(`wss://127.0.0.1:${session.port}/__iwer_mcp`, {
  rejectUnauthorized: false,
});
const timer = setTimeout(() => {
  console.error(`timeout waiting for ${method}`);
  process.exit(1);
}, 15000);
ws.on('open', () => {
  ws.send(
    JSON.stringify({
      deadline: Date.now() + 14000,
      expectedSessionId: session.sessionId,
      id,
      method,
      params: JSON.parse(rawParams),
    }),
  );
});
ws.on('message', (data) => {
  const message = JSON.parse(String(data));
  if (message.id !== id) return;
  clearTimeout(timer);
  console.log(JSON.stringify(message.error ?? message.result, null, 1));
  ws.close();
  process.exit(message.error ? 1 : 0);
});
ws.on('error', (error) => {
  console.error(String(error));
  process.exit(1);
});
