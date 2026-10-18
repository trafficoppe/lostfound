'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const path = require('path');
for (const tz of ['Asia/Bangkok', 'UTC', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
  test('lf-data.js ให้ผลเวลาไทยเหมือนกันเมื่อเครื่องอยู่เขตเวลา ' + tz, () => {
    const out = execFileSync(process.execPath, [path.join(__dirname, 'lf-data.check.cjs')], { env: Object.assign({}, process.env, { TZ: tz }) }).toString();
    assert.match(out, /^ok/);
  });
}
