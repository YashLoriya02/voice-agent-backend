import test from 'node:test';
import assert from 'node:assert/strict';
import { mapsAccess, drivingRoute, registerMapsRoutes } from '../services/maps.service.js';

// Explicit opt-in exists only in these synthetic Google-response tests.
const env = { ENABLE_PAID_MAPS: 'true', GOOGLE_MAPS_API_KEY: 'fake-google-key', MAPS_CLIENT_TOKEN: 'x'.repeat(40) };
const origin = { latitude: 19.076, longitude: 72.8777 };
const destination = 'Mumbai airport';
const place = { id: 'ChIJexample', displayName: { text: 'Mumbai airport' }, formattedAddress: 'Mumbai, Maharashtra' };
function mockGoogle(responses) {
    const calls = [];
    return { calls, fetchImpl: async (url, options) => {
        calls.push({ url, headers: options.headers, body: JSON.parse(options.body) });
        const next = responses.shift();
        if (!next) throw new Error('Unexpected Google request');
        return { ok: next.status === undefined, status: next.status || 200, json: async () => next };
    } };
}
test('Maps is disabled until configured and rejects absent/wrong client tokens', () => {
    assert.equal(mapsAccess('', {}).status, 503);
    assert.equal(mapsAccess('', env).status, 401);
    assert.equal(mapsAccess('Bearer incorrect', env).status, 401);
    assert.equal(mapsAccess(`Bearer ${env.MAPS_CLIENT_TOKEN}`, env), null);
});

test('Zero-cost default blocks Maps even with a valid key/token before any Google request', async () => {
    const zeroCostEnv = { ...env, ENABLE_PAID_MAPS: 'false' };
    assert.equal(mapsAccess(`Bearer ${env.MAPS_CLIENT_TOKEN}`, { ...env, ENABLE_PAID_MAPS: undefined }).status, 503);
    const handlers = {};
    let fetched = false;
    registerMapsRoutes({ get: (p, h) => handlers[p] = h, post: (p, h) => handlers[p] = h }, {
        env: zeroCostEnv, fetchImpl: () => { fetched = true; throw new Error(); },
    });
    const res = { set() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
    await handlers['/maps/route']({ get: () => `Bearer ${env.MAPS_CLIENT_TOKEN}`, body: { origin, destination } }, res);
    assert.equal(res.code, 503);
    assert.match(res.body.message, /zero-cost/);
    assert.equal(fetched, false);
});
test('HTTP route rejects unauthorized requests before contacting Google', async () => {
    const handlers = {};
    let fetched = false;
    registerMapsRoutes({ get: (p, h) => handlers[p] = h, post: (p, h) => handlers[p] = h }, { env, fetchImpl: () => { fetched = true; throw new Error(); } });
    const res = { set() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
    await handlers['/maps/route']({ get: () => '', body: { origin, destination } }, res);
    assert.equal(res.code, 401); assert.equal(fetched, false);
});
test('Invalid GPS coordinates never reach Google', async () => {
    const mock = mockGoogle([]);
    for (const bad of [{ latitude: 91, longitude: 0 }, { latitude: '19', longitude: 72 }, { latitude: 19, longitude: NaN }, null]) {
        assert.equal((await drivingRoute({ origin: bad, destination }, { env, ...mock })).status, 400);
    }
    assert.equal(mock.calls.length, 0);
});
test('Driving estimates use resolved place ID, traffic and metric API values; origin is not returned', async () => {
    const mock = mockGoogle([{ places: [place] }, { routes: [{ distanceMeters: 12500, duration: '1020.5s' }] }]);
    const result = await drivingRoute({ origin: { ...origin, unwanted: 'do not forward' }, destination }, { env, ...mock });
    assert.equal(result.body.distanceMeters, 12500); assert.equal(result.body.durationSeconds, 1020.5);
    assert.equal(mock.calls[1].body.travelMode, 'DRIVE'); assert.equal(mock.calls[1].body.routingPreference, 'TRAFFIC_AWARE');
    assert.deepEqual(mock.calls[1].body.destination, { placeId: place.id });
    assert.deepEqual(mock.calls[1].body.origin.location.latLng, origin);
    assert.equal(JSON.stringify(result).includes('latitude'), false);
});
test('Ambiguous destinations request selection without calculating an arbitrary route', async () => {
    const mock = mockGoogle([{ places: [place, { ...place, id: 'ChIJother', formattedAddress: 'Other area' }] }]);
    const result = await drivingRoute({ origin, destination }, { env, ...mock });
    assert.equal(result.body.status, 'needs_input'); assert.equal(result.body.candidates.length, 2); assert.equal(mock.calls.length, 1);
});
test('Chosen place bypasses search and computes its route', async () => {
    const mock = mockGoogle([{ routes: [{ distanceMeters: 0, duration: '0s' }] }]);
    const result = await drivingRoute({ origin, destination, placeId: place.id }, { env, ...mock });
    assert.equal(result.status, 200); assert.equal(mock.calls.length, 1); assert.ok(mock.calls[0].url.includes('computeRoutes'));
});
test('No route, malformed duration, denied Google access and quotas never produce invented estimates', async () => {
    for (const reply of [{ routes: [] }, { routes: [{ distanceMeters: 300, duration: 'tomorrow' }] }, { status: 403 }, { status: 429 }]) {
        const mock = mockGoogle([reply]);
        const result = await drivingRoute({ origin, destination, placeId: place.id }, { env, ...mock });
        assert.equal(result.body.success, false); assert.equal(result.body.distanceMeters, undefined);
    }
});
