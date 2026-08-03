const API_ROOT = "https://api.kerkdienstgemist.nl/api/v2";
const CACHE_TTL = 300; // 5 minuten caching (in seconden)
const MAX_CONCURRENCY = 2; // Maximaal 2 gelijktijdige fetches om de Worker limieten te respecteren
const MAX_SUBREQUESTS = 45; // Harde stop bij 45 subrequests (Cloudflare limiet is 50)

export default {
  async fetch(request, env, ctx) {
    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // 1. CORS Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405, headers });
    }

    // 2. Setup Cache
    const cacheUrl = new URL(request.url);
    const cacheKey = new Request(cacheUrl.toString(), request);
    const cache = caches.default;

    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      const response = new Response(cachedResponse.body, cachedResponse);
      response.headers.set("Access-Control-Allow-Origin", headers["Access-Control-Allow-Origin"]);
      return response;
    }

    // 3. API Fetcher met een strikte subrequest-teller
    let subrequestCount = 0;

    async function apiFetch(path) {
      if (subrequestCount >= MAX_SUBREQUESTS) {
        console.warn(`Subrequest limit (${MAX_SUBREQUESTS}) reached. Stopping fetches for: ${path}`);
        return null; // Stop netjes voordat Cloudflare de Worker laat crashen
      }
      
      subrequestCount++;
      const url = path.startsWith("http") ? path : API_ROOT + path;
      
      try {
        const res = await fetch(url, {
          headers: {
            Accept: "application/vnd.api+json",
            Authorization: `Bearer ${env.KERKDIENSTGEMIST_TOKEN}`,
          },
        });
        
        if (!res.ok) return null;
        return await res.json();
      } catch (e) {
        console.error(`Fetch failed for ${url}:`, e);
        return null;
      }
    }

    try {
      // 4. Haal stations op via /search, inclusief paginering als dat nodig is
      const stations = [];
      let searchPath = "/search?country=350&denomination=37&size=10&q=_";

      while (searchPath && subrequestCount < MAX_SUBREQUESTS) {
        const searchResult = await apiFetch(searchPath);
        
        if (!searchResult || !searchResult.data || searchResult.data.length === 0) {
          break; 
        }

        stations.push(...searchResult.data);

        // Volg de JSON:API "links.next" voor de volgende pagina
        if (searchResult.links && searchResult.links.next) {
          searchPath = searchResult.links.next;
        } else {
          searchPath = null;
        }
      }

      // 5. Haal de events (services) op per station in batches van maximaal 2
      const allServices = [];

      for (let i = 0; i < stations.length; i += MAX_CONCURRENCY) {
        if (subrequestCount >= MAX_SUBREQUESTS) {
          break; // Stop direct als we bij de grens komen, we leveren wat we tot nu toe hebben
        }

        const batch = stations.slice(i, i + MAX_CONCURRENCY);
        
        const batchPromises = batch.map(async (station) => {
          // 1e toevoeging: Controleer op een leeg stationId
          const stationId = station.relationships?.station?.data?.id;
          if (!stationId) return [];

          const eventsData = await apiFetch(`/stations/${stationId}/events`);
          
          if (eventsData && eventsData.data) {
            // 6. Map de JSON:API data en filter direct op toekomstige diensten
            return eventsData.data.map(event => {
              const attr = event.attributes || {};
              const gemeenteNaam = station.attributes?.name || "";

              return {
                id: event.id,
                station_id: stationId,
                gemeente: gemeenteNaam,
                start_at: attr.start_at,
                end_at: attr.end_at,
                voorganger: attr.artist,
                titel: attr.title,
                liturgie: attr.description,
                livestream_url: attr.url || station.attributes?.url,
                is_leesdienst: /leesdienst/i.test(attr.title || "")
              };
            }).filter(service => service.start_at && new Date(service.start_at) >= new Date()); // 2e toevoeging: filter in de toekomst
          }
          return [];
        });

        // Wacht tot deze kleine batch klaar is voordat de volgende 2 starten
        const batchResults = await Promise.all(batchPromises);
        
        for (const servicesArray of batchResults) {
          allServices.push(...servicesArray);
        }
      }

      // 7. Formatteer en sorteer de JSON exact zoals app.js verwacht (3e toevoeging)
      const finalJson = {
        services: allServices
          .filter(s => s.start_at)
          .sort((a, b) => a.start_at.localeCompare(b.start_at))
      };

      const response = new Response(JSON.stringify(finalJson), {
        status: 200,
        headers: {
          ...headers,
          "Cache-Control": `s-maxage=${CACHE_TTL}`, 
        },
      });

      // 8. Sla de afgeronde JSON asynchroon op in de cache
      ctx.waitUntil(cache.put(cacheKey, response.clone()));

      return response;

    } catch (e) {
      console.error("Worker Execution Error:", e);
      return new Response(
        JSON.stringify({
          error: "Internal Server Error",
          services: [] // Voorkom dat de frontend crasht, geef in elk geval services: [] terug
        }),
        {
          status: 500,
          headers,
        }
      );
    }
  },
};
