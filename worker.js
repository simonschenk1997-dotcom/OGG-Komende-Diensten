const API_ROOT = 'https://api.kerkdienstgemist.nl/api/v2';

function response(body, status, origin) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": origin || "*",
      "Vary": "Origin"
    }
  });
}

async function api(path, token) {
  const result = await fetch(`${API_ROOT}${path}`, {
    headers: {
      "Accept": "application/vnd.api+json",
      "Authorization": `Bearer ${token}`
    }
  });

  if (!result.ok) {
    const text = await result.text();
    throw new Error(`HTTP ${result.status}: ${text}`);
  }

  return result.json();
}

export default {
  async fetch(request, env) {

    const origin = request.headers.get("Origin");
    const allowedOrigin = env.ALLOWED_ORIGIN || "*";

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": allowedOrigin,
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "*"
        }
      });
    }

    try {

      const search = await api(
        "/search?country=350&denomination=37&include=station&page=1&size=1&q=_",
        env.KERKDIENSTGEMIST_TOKEN
      );

      return response(search, 200, allowedOrigin);

    } catch (error) {

      return response({
        error: error.message,
        stack: error.stack
      }, 500, allowedOrigin);

    }
  }
};
