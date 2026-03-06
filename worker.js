const GITHUB_ORIGIN = "https://github.com";
const ALLOWED_METHODS = new Set(["GET", "HEAD", "POST"]);
const ALLOWED_SERVICE = new Set(["git-upload-pack", "git-receive-pack"]);

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

function isAllowedGitPath(url) {
  // Git Smart HTTP discovery: /<owner>/<repo>.git/info/refs?service=git-upload-pack
  if (url.pathname.endsWith("/info/refs")) {
    return ALLOWED_SERVICE.has(url.searchParams.get("service") || "");
  }

  // Git Smart HTTP data endpoints
  if (url.pathname.endsWith("/git-upload-pack") || url.pathname.endsWith("/git-receive-pack")) {
    return true;
  }

  // Optional dumb-http object requests (some clients still probe these paths)
  if (
    /\/objects\/[0-9a-f]{2}\/[0-9a-f]{38}$/i.test(url.pathname) ||
    /\/objects\/pack\/pack-[0-9a-f]{40}\.(pack|idx)$/i.test(url.pathname) ||
    url.pathname.endsWith("/objects/info/packs") ||
    url.pathname.endsWith("/HEAD")
  ) {
    return true;
  }

  return false;
}

function sanitizeHeaders(headers) {
  const out = new Headers(headers);
  out.set("Host", "github.com");
  out.delete("Origin");
  out.delete("Referer");
  out.delete("CF-Connecting-IP");
  out.delete("CF-IPCountry");
  out.delete("CF-Ray");
  out.delete("X-Forwarded-For");
  out.delete("X-Real-IP");
  return out;
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (!ALLOWED_METHODS.has(request.method)) {
      return new Response("Only Git HTTP methods are allowed.", { status: 405 });
    }

    if (!isAllowedGitPath(url)) {
      return new Response("This endpoint only proxies Git protocol traffic.", { status: 403 });
    }

    if (isLikelyBrowser(request)) {
      return new Response("Browser access is disabled.", { status: 403 });
    }

    const githubUrl = GITHUB_ORIGIN + url.pathname + url.search;
    const proxyRequest = new Request(githubUrl, {
      method: request.method,
      headers: sanitizeHeaders(request.headers),
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
