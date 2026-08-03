const API_ROOT = "https://api.kerkdienstgemist.nl/api/v2";
const CACHE_TTL = 300; // 5 minuten (in seconden)
const MAX_CONCURRENT = 4; // Maximaal 4 gelijktijdige API verzoeken

// Helper functie voor de API calls
async function api(path, token) {
  const res = await fetch(API_ROOT + path, {
    headers: {
      Accept: "application/vnd.api+json",
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }

  return res.json();
}

// Queue / Worker Pool functie: Voert asynchrone taken uit met een max limiet
async function fetchInParallel(items, limit, asyncFn) {
  const results = new Array(items.length);
  let i = 0;
  
  // Maak een array van 'workers' die door de items heen loopen
  const workers = new Array(limit).fill(0).map(async () => {
    while (i < items.length) {
      const index = i++;
      results[index] = await asyncFn(items[index]);
    }
  });
  
  await Promise.all(workers);
  return results;
}

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

    // Alleen GET verzoeken toestaan
    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405, headers });
    }

    // 2. Caching instellen (Gebruik de request URL als cache key)
    const cacheUrl = new URL(request.url);
    const cacheKey = new Request(cacheUrl.toString(), request);
    const cache = caches.default;

    // Check of we een geldige cache hebben
    let response = await cache.match(cacheKey);
    if (response) {
      // Voeg CORS headers toe aan de gecachte response voor de zekerheid
      const cachedResponse = new Response(response.body, response);
      cachedResponse.headers.set("Access-Control-Allow-Origin", headers["Access-Control-Allow-Origin"]);
      return cachedResponse;
    }

    try {
      // 3. Haal de hoofdlijst op (Let op: Zorg dat de lijst klein genoeg is zodat totale subrequests < 50 blijft)
      const searchResult = await api(
        "/search?country=350&denomination=37&size=10&q=_",
        env.KERKDIENSTGEMIST_TOKEN
      );
      
      const churches = searchResult.data || [];

      // 4. Haal de gerelateerde data (services) op per kerk met een maximum van 4 tegelijk
      const allServicesArrays = await fetchInParallel(churches, MAX_CONCURRENT, async (church) => {
        try {
          // Haal specifieke data op voor deze kerk. 
          // (Pas het endpoint '/churches/${church.id}/services' aan als jouw API documentatie dit anders specificeert)
          const servicesRes = await api(`/churches/${church.id}/services`, env.KERKDIENSTGEMIST_TOKEN);
          
          // Haal alleen de noodzakelijke gegevens eruit om geheugen te besparen
          const services = servicesRes.data || [];
          return services.map(service => ({
            id: service.id,
            name: service.name || service.title,
            time: service.starts_at || service.time,
            churchId: church.id,
            // Voeg hier andere velden toe die je frontend nodig heeft
          }));
        } catch (err) {
          console.error(`Fout bij het ophalen van services voor kerk ${church.id}:`, err.message);
          return []; // Voorkom dat de hele applicatie crasht bij 1 falende kerk
        }
      });

      // 5. Combineer alle losse arrays van services tot één platte array
      const flattenedServices = allServicesArrays.flat();

      // 6. Formatteer exact zoals de frontend het verwacht: { services: [...] }
      const finalJson = {
        services: flattenedServices
      };

      // Maak de HTTP response
      response = new Response(JSON.stringify(finalJson), {
        status: 200,
        headers: {
          ...headers,
          "Cache-Control": `s-maxage=${CACHE_TTL}`, // Vertel Cloudflare om dit in de CDN te cachen
        },
      });

      // 7. Sla het resultaat op in de Cloudflare cache op de achtergrond
      // ctx.waitUntil zorgt dat de worker niet wordt afgesloten voordat de cache is weggeschreven
      ctx.waitUntil(cache.put(cacheKey, response.clone()));

      return response;

    } catch (e) {
      console.error("Worker Error:", e);
      return new Response(
        JSON.stringify({
          error: "Fout bij het ophalen van data.",
          services: [] // Geef in ieder geval een lege array terug voor de frontend
        }),
        {
          status: 500,
          headers,
        }
      );
    }
  },
};
