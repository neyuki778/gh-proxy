const GITHUB_HOST = "github.com";
const RAW_HOST = "raw.githubusercontent.com";
const DEFAULT_ALLOWED_COUNTRIES = new Set(["CN"]);
const FORWARDED_HEADER_ALLOWLIST = new Set([
  "accept",
  "accept-encoding",
  "accept-language",
  "authorization",
  "cache-control",
  "content-encoding",
  "content-length",
  "content-type",
  "git-protocol",
  "if-match",
  "if-modified-since",
  "if-none-match",
  "if-range",
  "if-unmodified-since",
  "pragma",
  "range",
  "user-agent",
]);

function buildAllowedCountries(env) {
  const raw = typeof env?.ALLOWED_COUNTRIES === "string" ? env.ALLOWED_COUNTRIES : "";
  if (!raw.trim()) {
    return DEFAULT_ALLOWED_COUNTRIES;
  }

  const values = raw
    .split(",")
    .map((v) => v.trim().toUpperCase())
    .filter(Boolean);

  return values.length > 0 ? new Set(values) : DEFAULT_ALLOWED_COUNTRIES;
}

function isAllowedCountry(request, env) {
  const fromCfObject = request.cf && request.cf.country ? request.cf.country : "";
  const fromHeader = request.headers.get("cf-ipcountry") || "";
  const country = (fromCfObject || fromHeader).toUpperCase();
  if (!country) {
    return false;
  }
  return buildAllowedCountries(env).has(country);
}

function isLikelyBrowserRequest(request) {
  const ua = request.headers.get("user-agent") || "";
  const accept = request.headers.get("accept") || "";
  const hasSecFetchHeaders =
    request.headers.has("sec-fetch-site") ||
    request.headers.has("sec-fetch-mode") ||
    request.headers.has("sec-fetch-dest");

  if (hasSecFetchHeaders) {
    return true;
  }

  const looksBrowserUa = /\b(Mozilla|Chrome|Safari|Edg|Firefox)\b/i.test(ua);
  if (looksBrowserUa && accept.includes("text/html")) {
    return true;
  }

  return false;
}

function shouldRouteToRaw(pathname) {
  if (pathname.includes("/raw/")) {
    return true;
  }

  // /owner/repo/refs/heads/<branch>/file
  return /^\/[^/]+\/[^/]+\/refs\/heads\/.+/.test(pathname);
}

function rewriteRawPath(pathname) {
  if (!pathname.includes("/raw/")) {
    return pathname;
  }

  // /owner/repo/raw/<...> -> /owner/repo/<...>
  return pathname.replace("/raw/", "/");
}

function resolveUpstream(pathname) {
  if (shouldRouteToRaw(pathname)) {
    return { host: RAW_HOST, path: rewriteRawPath(pathname) };
  }
  return { host: GITHUB_HOST, path: pathname };
}

function buildUpstreamHeaders(request, upstreamHost) {
  const out = new Headers();
  for (const key of FORWARDED_HEADER_ALLOWLIST) {
    const value = request.headers.get(key);
    if (value !== null) {
      out.set(key, value);
    }
  }

  out.set("Host", upstreamHost);
  out.set("Origin", `https://${upstreamHost}`);
  out.delete("referer");

  if (!out.has("user-agent")) {
    out.set("user-agent", "github-accelerator-worker/1.0");
  }
  return out;
}

function appendCorsHeaders(headers, request) {
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS");

  const reqHeaders = request.headers.get("Access-Control-Request-Headers");
  headers.set("Access-Control-Allow-Headers", reqHeaders || "*");
  headers.set("Access-Control-Max-Age", "86400");
}

function handleOptions(request) {
  const headers = new Headers();
  appendCorsHeaders(headers, request);
  return new Response(null, { status: 204, headers });
}

export default {
  async fetch(request, env) {
    if (!isAllowedCountry(request, env)) {
      return new Response("Geo blocked. This endpoint is only available from allowed regions.", {
        status: 403,
      });
    }

    if (isLikelyBrowserRequest(request)) {
      return new Response("Browser access is disabled.", { status: 403 });
    }

    if (request.method === "OPTIONS") {
      return handleOptions(request);
    }

    const url = new URL(request.url);
    const upstream = resolveUpstream(url.pathname);
    const upstreamUrl = `https://${upstream.host}${upstream.path}${url.search}`;

    const proxyRequest = new Request(upstreamUrl, {
      method: request.method,
      headers: buildUpstreamHeaders(request, upstream.host),
      body: request.method === "GET" || request.method === "HEAD" ? null : request.body,
      redirect: "follow",
    });

    try {
      const response = await fetch(proxyRequest);
      const outHeaders = new Headers(response.headers);
      outHeaders.delete("set-cookie");
      outHeaders.set("X-GitHub-Proxy", "gghub");
      appendCorsHeaders(outHeaders, request);

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: outHeaders,
      });
    } catch (err) {
      const headers = new Headers();
      appendCorsHeaders(headers, request);
      return new Response(`Upstream fetch failed: ${err?.message || "unknown error"}`, {
        status: 502,
        headers,
      });
    }
  },
};
