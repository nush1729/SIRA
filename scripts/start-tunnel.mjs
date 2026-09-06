/**
 * Starts a Cloudflare quick tunnel (no account needed) pointed at the local
 * dev server, and writes the assigned public URL into .env as APP_URL — so
 * candidate/interviewer email links work from any device, not just this
 * machine's localhost.
 *
 * The URL is random and changes every time this is (re)started, which is why
 * this is a separate always-on process rather than something baked into
 * `npm run dev`. After it prints "APP_URL updated", restart `next dev` (env
 * vars are only read at server startup) so new links use the new URL.
 *
 * Usage: node scripts/start-tunnel.mjs [port]   (defaults to 3000)
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const port = process.argv[2] || '3000';
const ENV_PATH = '.env';

function upsertEnv(key, value) {
  let text = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : '';
  const line = `${key}="${value}"`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(text)) {
    text = text.replace(re, line);
  } else {
    text = text.trimEnd() + `\n${line}\n`;
  }
  writeFileSync(ENV_PATH, text);
}

console.log(`Starting Cloudflare quick tunnel -> http://localhost:${port} ...`);

const cf = spawn('npx', ['--yes', 'cloudflared', 'tunnel', '--url', `http://localhost:${port}`], {
  shell: true,
});

let done = false;
const urlRe = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

function handle(chunk) {
  const text = chunk.toString();
  process.stderr.write(text); // cloudflared logs to stderr
  if (!done) {
    const match = text.match(urlRe);
    if (match) {
      done = true;
      upsertEnv('APP_URL', match[0]);
      console.log(`\nPublic URL: ${match[0]}`);
      console.log('APP_URL updated in .env — restart `npm run dev` to pick it up.\n');
      console.log('Leave this process running for as long as you want the link to work.');
    }
  }
}

cf.stdout.on('data', handle);
cf.stderr.on('data', handle);
cf.on('exit', (code) => {
  console.log(`cloudflared exited (code ${code}).`);
  process.exit(code ?? 0);
});
