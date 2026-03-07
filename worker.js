const DEFAULT_UPSTREAM_HOST = "github.com";
const ALLOWED_UPSTREAM_HOSTS = new Set([
  "github.com",
  "api.github.com",
  "raw.githubusercontent.com",
  "codeload.github.com",
  "objects.githubusercontent.com",
]);
const ALLOWED_METHODS = new Set(["GET", "HEAD", "POST"]);
const ALLOWED_SERVICE = new Set(["git-upload-pack", "git-receive-pack"]);
const AUX_HOST_ROUTE_PREFIX = "/__host/";
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
  "if-modified-since",
  "if-none-match",
  "pragma",
  "range",
  "user-agent",
]);

function isLikelyBrowser(request) {
  const ua = request.headers.get("user-agent") || "";
  const accept = request.headers.get("accept") || "";
  const hasSecFetch =
    request.headers.has("sec-fetch-site") ||
    request.headers.has("sec-fetch-mode") ||
    request.headers.has("sec-fetch-dest");

  return (
    hasSecFetch ||
    /\b(Mozilla|Chrome|Safari|Edg)\b/i.test(ua) ||
    accept.includes("text/html")
  );
}

function isAllowedGitPath(pathname, searchParams) {
  // Git Smart HTTP discovery: /<owner>/<repo>.git/info/refs?service=git-upload-pack
  if (pathname.endsWith("/info/refs")) {
    return ALLOWED_SERVICE.has(searchParams.get("service") || "");
  }

  // Git Smart HTTP data endpoints
  if (pathname.endsWith("/git-upload-pack") || pathname.endsWith("/git-receive-pack")) {
    return true;
  }

  // Optional dumb-http object requests (some clients still probe these paths)
  if (
    /\/objects\/[0-9a-f]{2}\/[0-9a-f]{38}$/i.test(pathname) ||
    /\/objects\/pack\/pack-[0-9a-f]{40}\.(pack|idx)$/i.test(pathname) ||
    pathname.endsWith("/objects/info/packs") ||
    pathname.endsWith("/HEAD")
  ) {
    return true;
  }

  return false;
}

function parseUpstreamTarget(pathname) {
  if (!pathname.startsWith(AUX_HOST_ROUTE_PREFIX)) {
    return { host: DEFAULT_UPSTREAM_HOST, path: pathname };
  }

  const rest = pathname.slice(AUX_HOST_ROUTE_PREFIX.length);
  const firstSlash = rest.indexOf("/");
  if (firstSlash <= 0) {
    return { error: "Invalid upstream host route." };
  }

  const host = rest.slice(0, firstSlash).toLowerCase();
  const path = rest.slice(firstSlash);
  if (!ALLOWED_UPSTREAM_HOSTS.has(host)) {
    return { error: "Upstream host is not allowed." };
  }

  return { host, path };
}

function isAllowedTarget(host, pathname, searchParams, method) {
  if (!ALLOWED_UPSTREAM_HOSTS.has(host)) {
    return false;
  }

  if (host === DEFAULT_UPSTREAM_HOST) {
    return isAllowedGitPath(pathname, searchParams);
  }

  // Aux hosts are only for redirected binary/content fetches.
  return method === "GET" || method === "HEAD";
}

function buildUpstreamHeaders(request) {
  const out = new Headers();
  for (const key of FORWARDED_HEADER_ALLOWLIST) {
    const value = request.headers.get(key);
    if (value !== null) {
      out.set(key, value);
    }
  }

  if (!out.has("user-agent")) {
    out.set("user-agent", "git-proxy-worker/1.0");
  }

  return out;
}

function buildAllowedCountries(env) {
  const raw = typeof env?.ALLOWED_COUNTRIES === "string" ? env.ALLOWED_COUNTRIES : "";
  if (!raw.trim()) {
    return DEFAULT_ALLOWED_COUNTRIES;
  }

  const items = raw
    .split(",")
    .map((v) => v.trim().toUpperCase())
    .filter(Boolean);

  return items.length > 0 ? new Set(items) : DEFAULT_ALLOWED_COUNTRIES;
}

function isAllowedCountry(request, env) {
  const country = (request.cf && request.cf.country ? request.cf.country : "").toUpperCase();
  const allowed = buildAllowedCountries(env);
  return country && allowed.has(country);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const target = parseUpstreamTarget(url.pathname);

    if (!isAllowedCountry(request, env)) {
      return new Response("Geo blocked. This endpoint is only available from allowed regions.", {
        status: 403,
      });
    }

    if (!ALLOWED_METHODS.has(request.method)) {
      return new Response("Only Git HTTP methods are allowed.", { status: 405 });
    }

    if (target.error) {
      return new Response(target.error, { status: 400 });
    }

    if (!isAllowedTarget(target.host, target.path, url.searchParams, request.method)) {
      return new Response("This endpoint only proxies Git protocol traffic.", { status: 403 });
    }

    if (isLikelyBrowser(request)) {
      return new Response("Browser access is disabled.", { status: 403 });
    }

    const upstreamUrl = `https://${target.host}${target.path}${url.search}`;
    const proxyRequest = new Request(upstreamUrl, {
      method: request.method,
      headers: buildUpstreamHeaders(request),
      body: request.method === "GET" || request.method === "HEAD" ? null : request.body,
      redirect: "follow",
    });

    try {
      const response = await fetch(proxyRequest);
      const outHeaders = new Headers(response.headers);
      outHeaders.set("X-Git-Proxy", "github-only");
      outHeaders.delete("set-cookie");

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: outHeaders,
      });
    } catch (err) {
      return new Response(`Upstream fetch failed: ${err?.message || "unknown error"}`, {
        status: 502,
      });
    }
  },
};
