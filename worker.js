const API_ROOT = 'https://api.kerkdienstgemist.nl/api/v2';

function response(body, status, origin) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } });
}
async function api(path, token) {
  const result = await fetch(`${API_ROOT}${path}`, { headers: { Accept: 'application/vnd.api+json', Authorization: `Bearer ${token}` } });
  if (!result.ok) throw new Error(`Kerkdienstgemist API returned ${result.status}`);
  return result.json();
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowedOrigin = env.ALLOWED_ORIGIN;
    if (request.method === 'OPTIONS') return new Response(null, { headers: { 'Access-Control-Allow-Origin': allowedOrigin, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Accept', Vary: 'Origin' } });
    if (request.method !== 'GET' || new URL(request.url).pathname !== '/api/services') return response({ error: 'Niet gevonden.' }, 404, allowedOrigin);
    if (origin && origin !== allowedOrigin) return response({ error: 'Deze oorsprong is niet toegestaan.' }, 403, allowedOrigin);
    if (!env.KERKDIENSTGEMIST_TOKEN) return response({ error: 'Serverconfiguratie ontbreekt.' }, 503, allowedOrigin);
    try {
      const services = []; let page = 1;
      while (true) {
        const search = await api(`/search?country=350&denomination=37&include=station,station.streams&page=${page}&q=_&size=10&station=1`, env.KERKDIENSTGEMIST_TOKEN);
        const hits = search.data || []; if (!hits.length) break;
        await Promise.all(hits.map(async hit => {
          const stationId = hit.relationships?.station?.data?.id; if (!stationId) return;
          const [station, events] = await Promise.all([api(`/stations/${stationId}`, env.KERKDIENSTGEMIST_TOKEN), api(`/stations/${stationId}/events`, env.KERKDIENSTGEMIST_TOKEN)]);
          const gemeente = station.data?.attributes?.name || 'Onbekende gemeente';
          for (const event of (events.data || []).sort((a, b) => (a.attributes?.start_at || '').localeCompare(b.attributes?.start_at || '')).slice(0, 20)) { const attr = event.attributes || {}; const title = attr.title || ''; services.push({ station_id: stationId, gemeente, start_at: attr.start_at, end_at: attr.end_at || null, voorganger: attr.artist || '', titel: title, is_leesdienst: /leesdienst/i.test(title), liturgie: attr.description || '', livestream_url: attr.url || station.data?.attributes?.url || null }); }
        }));
        page += 1;
      }
      return response({ services: services.filter(s => s.start_at && new Date(s.start_at) >= new Date()).sort((a, b) => a.start_at.localeCompare(b.start_at)) }, 200, allowedOrigin);
    } catch (error) { console.error(error); return response({ error: 'De brongegevens konden niet worden geladen.' }, 502, allowedOrigin); }
  }
};
