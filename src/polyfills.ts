/**
 * Hermes is missing a handful of Node-ish globals that mammoth's browser bundle
 * (and jszip underneath it) reaches for. They are cheap, so we install them
 * unconditionally at app entry, before any service module is imported.
 *
 * pdf-lib needs nothing here — it is dependency-free and typed-array only.
 */
import { Buffer } from 'buffer';

declare const global: Record<string, any>;

if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}

if (typeof global.process === 'undefined') {
  global.process = {};
}
if (typeof global.process.env === 'undefined') {
  global.process.env = {};
}
// jszip branches on `process.version` to pick a Buffer strategy; an empty
// string keeps it on the browser path, which is the one that works here.
if (typeof global.process.version === 'undefined') {
  global.process.version = '';
}
if (typeof global.process.nextTick !== 'function') {
  global.process.nextTick = (fn: (...args: any[]) => void, ...args: any[]) => {
    setTimeout(() => fn(...args), 0);
  };
}

export {};
