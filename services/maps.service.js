import { timingSafeEqual } from 'node:crypto';

const problem = (status, message) => ({ status, body: { success: false, message } });
export function mapsAccess(authorization, env = process.env) {
    if (env.ENABLE_PAID_MAPS !== 'true') {
        return problem(503, 'Google Maps Places/Routes APIs are disabled for zero-cost operation. You can open the installed Maps app for directions.');
    }
    if (!env.GOOGLE_MAPS_API_KEY || !env.MAPS_CLIENT_TOKEN || env.MAPS_CLIENT_TOKEN.length < 32) {
        return problem(503, 'Maps is not configured. Set GOOGLE_MAPS_API_KEY and a MAPS_CLIENT_TOKEN of at least 32 characters on the backend.');
    }
    const expected = Buffer.from(`Bearer ${env.MAPS_CLIENT_TOKEN}`);
    const provided = Buffer.from(typeof authorization === 'string' ? authorization : '');
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
        return problem(401, 'Maps access was rejected. Check the app and backend Maps client token.');
    }
    return null;
}

export async function drivingRoute(input, { env = process.env, fetchImpl = fetch } = {}) {
    const origin = input?.origin;
    const destination = typeof input?.destination === 'string' ? input.destination.trim() : '';
    const placeId = typeof input?.placeId === 'string' ? input.placeId : '';
    if (!origin || !Number.isFinite(origin.latitude) || !Number.isFinite(origin.longitude) ||
        Math.abs(origin.latitude) > 90 || Math.abs(origin.longitude) > 180 ||
        !destination || destination.length > 250 || (placeId && !/^[A-Za-z0-9_-]{1,250}$/.test(placeId))) {
        return problem(400, 'Provide a valid current location and a destination name or address.');
    }
    // Copy only coordinates, preventing model-supplied extra fields reaching Google.
    const latLng = { latitude: origin.latitude, longitude: origin.longitude };
    async function google(url, payload, fieldMask) {
        const response = await fetchImpl(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': env.GOOGLE_MAPS_API_KEY, 'X-Goog-FieldMask': fieldMask },
            body: JSON.stringify(payload), signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) throw new Error(response.status === 403 ? 'setup' : response.status === 429 ? 'quota' : 'provider');
        return response.json();
    }
    try {
        let selected = { id: placeId, name: destination, address: '' };
        if (!placeId) {
            const search = await google('https://places.googleapis.com/v1/places:searchText', {
                textQuery: destination, pageSize: 3,
                locationBias: { circle: { center: latLng, radius: 50000 } },
            }, 'places.id,places.displayName,places.formattedAddress');
            const candidates = (search.places || []).filter(p => p.id && p.displayName?.text).map(p => ({
                id: p.id, name: p.displayName.text, address: p.formattedAddress || '',
            }));
            if (!candidates.length) return problem(404, 'No matching destination was found. Include the area, city or full address.');
            if (candidates.length > 1) return { status: 200, body: { success: true, status: 'needs_input', candidates } };
            selected = candidates[0];
        }
        const data = await google('https://routes.googleapis.com/directions/v2:computeRoutes', {
            origin: { location: { latLng } }, destination: { placeId: selected.id },
            travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE', computeAlternativeRoutes: false,
        }, 'routes.distanceMeters,routes.duration');
        const route = data.routes?.[0];
        const duration = typeof route?.duration === 'string' && /^(\d+(?:\.\d+)?)s$/.exec(route.duration);
        const seconds = duration ? Number(duration[1]) : NaN;
        if (!route || !Number.isFinite(route.distanceMeters) || route.distanceMeters < 0 || !Number.isFinite(seconds) || seconds < 0) {
            return problem(404, 'Google Maps did not return a drivable route to that destination.');
        }
        return { status: 200, body: { success: true, status: 'completed', destination: selected,
            distanceMeters: route.distanceMeters, durationSeconds: seconds, source: 'Google Maps', trafficAware: true } };
    } catch (error) {
        const message = error.message === 'setup' ? 'Google Maps access is disabled. Enable Places API (New), Routes API and billing, and check key restrictions.' :
            error.message === 'quota' ? 'The Google Maps quota has been reached. Try again later.' :
            'Could not get driving estimates from Google Maps. Check your connection and try again.';
        return problem(502, message);
    }
}

export function registerMapsRoutes(app, { env = process.env, fetchImpl = fetch } = {}) {
    // Personal-app token plus warm-process burst limit. Also set provider quotas.
    let windowStarted = 0;
    let requests = 0;
    app.get('/maps/status', (req, res) => {
        res.set('Cache-Control', 'no-store');
        const denied = mapsAccess(req.get('Authorization'), env);
        if (denied) return res.status(denied.status).json(denied.body);
        res.json({ success: true, configured: true });
    });
    app.post('/maps/route', async (req, res) => {
        res.set('Cache-Control', 'no-store');
        const denied = mapsAccess(req.get('Authorization'), env);
        if (denied) return res.status(denied.status).json(denied.body);
        if (Date.now() - windowStarted > 60_000) { windowStarted = Date.now(); requests = 0; }
        if (++requests > 20) return res.status(429).json({ success: false, message: 'Too many route requests. Wait a minute and try again.' });
        const result = await drivingRoute(req.body, { env, fetchImpl });
        res.status(result.status).json(result.body);
    });
}
