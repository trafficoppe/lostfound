// โหลดก่อนรันทดสอบ: ห้ามต่อเครือข่ายภายนอกทุกช่องทาง (ยกเว้นเครื่องตัวเอง) — พิสูจน์ว่าการทดสอบไม่ส่งอะไรออกจริง
// ใช้: node --require ./tests/no-network.cjs --test tests/*.test.cjs
'use strict';
const net = require('net'), dns = require('dns');
const LOCAL = /^(localhost|127\.\d+\.\d+\.\d+|::1|::ffff:127\.\d+\.\d+\.\d+)$/i;
const deny = what => { const e = new Error('no-network: ห้ามต่อเครือข่ายภายนอกระหว่างทดสอบ (' + what + ')'); e.code = 'ENETBLOCKED'; throw e; };
const origConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const o = typeof args[0] === 'object' && args[0] !== null ? args[0] : { port: args[0], host: typeof args[1] === 'string' ? args[1] : 'localhost' };
  if (o.path) return origConnect.apply(this, args);                     // unix socket ภายในเครื่อง
  const host = o.host || 'localhost';
  if (!LOCAL.test(host)) deny('connect ' + host + ':' + o.port);
  return origConnect.apply(this, args);
};
const origLookup = dns.lookup;
dns.lookup = function (host, ...rest) { if (!LOCAL.test(String(host))) deny('dns ' + host); return origLookup.call(this, host, ...rest); };
if (dns.promises) { const pl = dns.promises.lookup; dns.promises.lookup = (h, ...r) => LOCAL.test(String(h)) ? pl(h, ...r) : Promise.reject(new Error('no-network: dns ' + h)); }
if (typeof globalThis.fetch === 'function') {
  const of = globalThis.fetch;
  globalThis.fetch = (u, ...r) => { const h = new URL(String(u && u.url || u)).hostname; return LOCAL.test(h) ? of(u, ...r) : Promise.reject(new Error('no-network: fetch ' + h)); };
}
