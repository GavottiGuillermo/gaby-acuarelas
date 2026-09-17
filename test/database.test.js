const test = require('node:test');
const assert = require('node:assert/strict');
const { sslConfig } = require('../src/database');

test('configura TLS verificado para conexiones externas', () => {
  assert.deepEqual(sslConfig({ DATABASE_SSL_MODE: 'require' }), {
    rejectUnauthorized: true
  });
});

test('no fuerza TLS para la conexión interna salvo configuración explícita', () => {
  assert.equal(sslConfig({}), undefined);
  assert.equal(sslConfig({ DATABASE_SSL_MODE: 'disable' }), false);
});

