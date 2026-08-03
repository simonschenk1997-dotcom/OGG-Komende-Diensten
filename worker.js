const API_ROOT = "https://api.kerkdienstgemist.nl/api/v2";

async function api(path, token) {
  const res = await fetch(API_ROOT + path, {
    headers: {
      Accept: "application/vnd.api+json",
      Authorization: `Bearer ${token}`,
    },
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`API ${res.status}: ${text}`);
  }

  return JSON.parse(text);
}

export default {
  async fetch(request, env) {
    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    };

    if (request.method === "OPTIONS") {
      return new Response("", { headers });
    }

    try {
      const result = await api(
        "/search?country=350&denomination=37&size=10&q=_",
        env.KERKDIENSTGEMIST_TOKEN
      );

      return new Response(JSON.stringify(result), {
        status: 200,
        headers,
      });
    } catch (e) {
      return new Response(
        JSON.stringify({
          error: e.message,
          stack: e.stack,
        }),
        {
          status: 500,
          headers,
        }
      );
    }
  },
};
