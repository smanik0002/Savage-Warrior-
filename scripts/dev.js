// Starts the Vite client and the Socket.IO game server together.
import { spawn } from 'node:child_process';

const run = (name, cmd) => {
  const p = spawn(cmd, { stdio: 'inherit', shell: true });
  p.on('exit', (code) => {
    console.log(`[${name}] exited (${code})`);
    process.exit(code ?? 0);
  });
  return p;
};

console.log('Starting Savage Warrior: client http://localhost:5173  |  server http://localhost:3001');
const server = run('server', 'node server/index.js');
const client = run('client', 'npx vite');

const stop = () => { server.kill(); client.kill(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
