const API_ROOT = "https://api.kerkdienstgemist.nl/api/v2";

async function api(path, token) {
  const res = await fetch(API_ROOT + path, {
    headers: {
      Accept: "application/vnd.api+json",
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    // Lees de tekst alleen als het mislukt, om de exacte HTML/JSON foutmelding te loggen
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }

  // Zet direct om naar JSON bij een succesvolle aanroep
  return res.json();
}

export default {
  async fetch(request, env) {
    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handel CORS preflight-verzoeken af
    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    try {
      // Misschien wil je de 'q' parameter in de toekomst dynamisch maken
      const result = await api(
        "/search?country=350&denomination=37&size=10&q=_",
        env.KERKDIENSTGEMIST_TOKEN
      );

      return new Response(JSON.stringify(result), {
        status: 200,
        headers,
      });
    } catch (e) {
      // Log de volledige fout en stack trace in je Worker logs
      console.error("Kerkdienst API Fout:", e);

      // Stuur een veiligere, opgeschoonde foutmelding naar de client
      return new Response(
        JSON.stringify({
          error: "Kan geen gegevens ophalen van de externe API.",
          details: e.message
        }),
        {
          status: 500,
          headers,
        }
      );
    }
  },
};
