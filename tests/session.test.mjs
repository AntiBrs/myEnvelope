import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

async function harness(platform = 'web', apiUrl = '/api') {
  const state = { legacyRemoved: [], secure: new Map(), requests: [], unauthorized: 0 };
  const context = vm.createContext({
    URL, Headers, AbortController, setTimeout, clearTimeout, console,
    __DEV__: false,
    process: { env: { EXPO_PUBLIC_API_BASE_URL: apiUrl } },
    window: { location: { origin: 'http://localhost:8080' } },
    fetch: async (...args) => { state.requests.push(args); return state.response ?? { status: 200 }; },
  });
  const dependencies = {
    'react-native': { Platform: { OS: platform } },
    'expo-secure-store': {
      WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only',
      getItemAsync: async (key) => state.secure.get(key) ?? null,
      setItemAsync: async (key, value, options) => { state.secure.set(key, value); state.options = options; },
      deleteItemAsync: async (key) => { state.secure.delete(key); },
    },
    '@react-native-async-storage/async-storage': {
      default: { multiRemove: async (keys) => { state.legacyRemoved.push(...keys); } },
    },
  };
  const modules = new Map();
  async function load(name) {
    if (modules.has(name)) return modules.get(name);
    let module;
    if (dependencies[name]) {
      const exports = dependencies[name];
      module = new vm.SyntheticModule(Object.keys(exports), function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
      }, { context });
    } else {
      const file = name === './session' ? 'session' : 'api';
      module = new vm.SourceTextModule(await readFile(new URL(`../config/${file}.js`, import.meta.url), 'utf8'), { context });
    }
    modules.set(name, module);
    await module.link(load);
    return module;
  }
  const api = await load('./api');
  await api.evaluate();
  api.namespace.setUnauthorizedHandler(() => { state.unauthorized++; });
  return { state, session: modules.get('./session').namespace, api: api.namespace };
}

test('browser tokens never enter persistent storage and legacy plaintext is removed', async () => {
  const { state, session } = await harness();
  await session.setToken('test-token');
  assert.equal(await session.getToken(), 'test-token');
  assert.equal(state.secure.size, 0);
  assert.deepEqual(state.legacyRemoved, ['userToken', 'userId']);
  await session.clearToken();
  assert.equal(await session.getToken(), null);
});

test('native tokens use device-only SecureStore and are deleted on signout', async () => {
  const { state, session } = await harness('android', 'https://example.test/api');
  await session.setToken('native-test-token');
  assert.equal(await session.getToken(), 'native-test-token');
  assert.equal(state.options.keychainAccessible, 'device-only');
  await session.clearToken();
  assert.equal(state.secure.size, 0);
});

test('a navigation-supplied foreign API never receives a token', async () => {
  const { state, session, api } = await harness();
  await session.setToken('test-token');
  await assert.rejects(api.apiFetch('https://attacker.invalid/api/expenses'), /outside the configured API/);
  await assert.rejects(api.apiFetch('http://localhost:8080/api-lookalike/expenses'), /outside the configured API/);
  assert.equal(state.requests.length, 0);
});

test('production native requests require HTTPS outside loopback', async () => {
  const { state, api } = await harness('android', 'http://example.test/api');
  await assert.rejects(api.apiFetch('http://example.test/api/categories'), /HTTPS is required/);
  assert.equal(state.requests.length, 0);
});

test('401 clears the current session and notifies navigation', async () => {
  const { state, session, api } = await harness();
  await session.setToken('test-token');
  state.response = { status: 401 };
  await api.apiFetch('/api/categories');
  assert.equal(state.requests[0][1].headers.get('Authorization'), 'Bearer test-token');
  assert.equal(state.requests[0][1].redirect, 'error');
  assert.equal(state.requests[0][1].credentials, 'omit');
  assert.equal(await session.getToken(), null);
  assert.equal(state.unauthorized, 1);
});

test('an old pending 401 cannot erase a newly logged-in session', async () => {
  const { state, session, api } = await harness();
  await session.setToken('old-token');
  let finish;
  state.response = new Promise(resolve => { finish = resolve; });
  const pending = api.apiFetch('/api/categories');
  while (!state.requests.length) await new Promise(resolve => setImmediate(resolve));
  await session.setToken('new-token');
  finish({ status: 401 });
  await pending;
  assert.equal(await session.getToken(), 'new-token');
  assert.equal(state.unauthorized, 0);
});
