// Icicle Twin QEMU spike (issue #153): load QEMU (wasm), boot Linux on the microchip-icicle-kit
// machine, connect its MMUART1 console to xterm.js and its GPIO2 register window to the LEDs.
// Both bridges are plain shared memory (the wasm memory is a SharedArrayBuffer): see
// tools/qemu/patches/ and docs/QEMU_SPIKE.md.
/* global Terminal */

const T0 = performance.now();
const statusEl = document.getElementById('status');
const timingsEl = document.getElementById('timings');
const envEl = document.getElementById('env');
const params = new URLSearchParams(location.search);
const spike = (window.spike = { timings: {}, bytes: 0, gpio: null, log: '' });

function row(table, key, value, cls = '') {
  let tr = table.querySelector(`tr[data-k="${key}"]`);
  if (!tr) {
    tr = document.createElement('tr');
    tr.dataset.k = key;
    tr.innerHTML = '<td></td><td></td>';
    table.appendChild(tr);
  }
  tr.cells[0].textContent = key;
  tr.cells[1].textContent = value;
  tr.cells[1].className = cls;
}
function mark(name) {
  if (spike.timings[name] !== undefined) return;
  const ms = Math.round(performance.now() - T0);
  spike.timings[name] = ms;
  row(timingsEl, name, String(ms));
}
function status(text, cls = '') {
  statusEl.textContent = text;
  statusEl.className = cls;
}

row(envEl, 'crossOriginIsolated', String(window.crossOriginIsolated), window.crossOriginIsolated ? 'ok' : 'bad');
row(envEl, 'SharedArrayBuffer', typeof SharedArrayBuffer === 'function' ? 'yes' : 'no');
row(envEl, 'service worker', navigator.serviceWorker?.controller ? 'controlling' : 'none');
row(envEl, 'hardware threads', String(navigator.hardwareConcurrency));

if (!window.crossOriginIsolated) {
  // coi-serviceworker registers and reloads the page once; if we are still here, it could not.
  status('not cross-origin isolated yet (the service worker reloads the page once)', 'warn');
  throw new Error('not cross-origin isolated');
}

// ---- terminal: xterm.js on QEMU's console rings (MMUART1 = COM B, the Linux console) ----
const term = new Terminal({ scrollback: 5000, fontSize: 13, theme: { background: '#000' } });
term.open(document.getElementById('terminal'));
const markers = [
  ['OpenSBI banner', 'OpenSBI v'],
  ['Linux banner', 'Linux version'],
  ['init (userspace)', 'Icicle Twin QEMU spike:'],
  ['shell prompt', 'root@icicle-kit-es:'],
];
const decoder = new TextDecoder();
function consoleOut(bytes) {
  if (spike.timings['first serial byte'] === undefined) mark('first serial byte');
  spike.log += decoder.decode(bytes, { stream: true });
  for (const [name, needle] of markers) {
    if (spike.timings[name] === undefined && spike.log.includes(needle)) {
      mark(name);
      if (name === 'shell prompt') status('booted: type into the console', 'ok');
    }
  }
  term.write(bytes);
}
function fit() {
  const el = document.getElementById('terminal');
  const cell = term._core?._renderService?.dimensions?.css?.cell;
  const cw = cell?.width || 8;
  const ch = cell?.height || 17;
  term.resize(Math.max(40, Math.floor((el.clientWidth - 12) / cw)), Math.max(10, Math.floor((el.clientHeight - 12) / ch)));
}
fit();
addEventListener('resize', fit);

// ---- downloads ----
async function get(name) {
  const res = await fetch(`bin/${name}`);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  spike.bytes += buf.length;
  return buf;
}
status('downloading guest image…');
// ?smp=5: all four U54s like the real kit (E51 + 4 x U54); default: E51 + one U54.
const smp5 = params.get('smp') === '5';
const dtb = smp5 ? 'icicle-spike-smp5.dtb' : 'icicle-spike.dtb';
const names = ['opensbi-riscv64-generic-fw_dynamic.bin', 'Image', dtb];
const blobs = Object.fromEntries(await Promise.all(names.map(async (n) => [n, await get(n)])));
mark('guest image fetched');

// ---- QEMU ----
const accel = params.get('thread') === 'multi' ? 'tcg,thread=multi' : 'tcg';
const args = [
  '-M', 'microchip-icicle-kit', '-smp', smp5 ? '5' : '2', '-m', '256M',
  '-accel', accel,
  '-display', 'none', '-monitor', 'none', '-nic', 'none',
  // MMUART0 (HSS, COM A) is unused. No -serial for MMUART1: the patched machine then connects it to
  // the shared-memory console rings this page reads.
  '-serial', 'null',
  '-L', '/pack',
  '-kernel', '/pack/Image', '-dtb', `/pack/${dtb}`,
];
if (params.get('append')) args.push('-append', params.get('append'));
row(envEl, 'accel', accel);
row(envEl, 'harts', smp5 ? 'E51 + 4 x U54' : 'E51 + 1 x U54');

const Module = {
  arguments: args,
  mainScriptUrlOrBlob: new URL('bin/qemu-system-riscv64.js', location.href).href,
  locateFile: (path) => new URL(`bin/${path}`, location.href).href,
  preRun: [
    (mod) => {
      mod.FS.mkdir('/pack');
      for (const [name, data] of Object.entries(blobs)) mod.FS.writeFile(`/pack/${name}`, data);
    },
  ],
  print: (t) => console.log(t),
  printErr: (t) => console.warn(t),
};
status('compiling QEMU (WebAssembly)…');
const { default: initQemu } = await import('./bin/qemu-system-riscv64.js');
mark('QEMU module imported');
const instance = await initQemu(Module);
mark('QEMU runtime ready');
row(envEl, 'guest image (raw)', `${(spike.bytes / 1e6).toFixed(1)} MB`);
status('booting…');

const u32 = instance.HEAPU32;
const u8 = instance.HEAPU8;

// ---- console rings (struct SpikeConsoleWindow in the QEMU patch) ----
// u32 words: 0 magic, 1 out_head, 2 out_tail, 3 in_head, 4 in_tail, 5 out_size, 6 in_size, 7 dropped
const con = instance._qemu_spike_console_window();
const c = con >>> 2;
if (u32[c] !== 0x434f4e31) console.warn('console window magic mismatch');
const OUT_SIZE = u32[c + 5];
const IN_SIZE = u32[c + 6];
const OUT = con + 32;
const IN = OUT + OUT_SIZE;
setInterval(() => {
  const head = Atomics.load(u32, c + 1);
  const tail = u32[c + 2];
  const n = (head - tail) >>> 0;
  if (n === 0) return;
  const bytes = new Uint8Array(n);
  for (let i = 0; i < n; i++) bytes[i] = u8[OUT + (((tail + i) >>> 0) % OUT_SIZE)];
  Atomics.store(u32, c + 2, head);
  consoleOut(bytes);
}, 4);
const encoder = new TextEncoder();
term.onData((text) => {
  let head = u32[c + 3];
  const tail = Atomics.load(u32, c + 4);
  for (const b of encoder.encode(text)) {
    if (((head - tail) >>> 0) >= IN_SIZE) break; // full: QEMU drains it into the UART every 2 ms
    u8[IN + (head % IN_SIZE)] = b;
    head = (head + 1) >>> 0;
  }
  Atomics.store(u32, c + 3, head);
});

// ---- GPIO2 register window (struct SpikeGpioWindow) -> the four user LEDs ----
// u32 words: 0 magic, 1 seq, 2..33 GPIO_CFG[0..31], 34 GPIO_IRQ, 35 GPIO_OUT, 36 last offset, 37 last value
const win = instance._qemu_spike_gpio2_window() >>> 2;
if (u32[win] !== 0x47504932) console.warn('GPIO2 window magic mismatch');
const ledEls = [...document.querySelectorAll('.led')];
const outEl = document.getElementById('gpio-out');
const seqEl = document.getElementById('gpio-seq');
let lastSeq = -1;
(function poll() {
  const seq = u32[win + 1];
  if (seq !== lastSeq) {
    lastSeq = seq;
    const out = u32[win + 35];
    spike.gpio = { out, seq };
    outEl.textContent = '0x' + out.toString(16).padStart(8, '0');
    seqEl.textContent = String(seq);
    for (const el of ledEls) el.classList.toggle('on', ((out >>> Number(el.dataset.bit)) & 1) === 1);
  }
  requestAnimationFrame(poll);
})();
term.focus();
