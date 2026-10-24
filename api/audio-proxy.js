const ALLOWED_AUDIO_HOSTS = new Set([
  "audio.noorapp.in",
  "files.manuscdn.com",
]);

function getSingleQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Range, Content-Type");
    res.status(204).end();
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD, OPTIONS");
    res.status(405).end("Method Not Allowed");
    return;
  }

  const rawUrl = getSingleQueryValue(req.query?.url);
  let target;
  try {
    target = new URL(rawUrl || "");
  } catch {
    res.status(400).end("Invalid audio URL");
    return;
  }

  if (target.protocol !== "https:" || !ALLOWED_AUDIO_HOSTS.has(target.hostname)) {
    res.status(403).end("Audio host is not allowed");
    return;
  }

  const headers = {};
  if (req.headers.range) headers.Range = req.headers.range;

  // M-10: never let fetch follow redirects blindly. The allow-list above is
  // checked only against the initial URL, so a "follow" redirect from an
  // allowed host to any other host would have been proxied (and cached for a
  // year). Follow redirects manually, re-validating protocol + allow-list on
  // every hop, and refuse anything that leaves the allow-list.
  const MAX_REDIRECTS = 5;
  function isAllowedAudioUrl(url) {
    return url.protocol === "https:" && ALLOWED_AUDIO_HOSTS.has(url.hostname);
  }

  try {
    let upstream;
    let current = target;
    for (let hop = 0; ; hop++) {
      const response = await fetch(current, {
        method: req.method,
        headers,
        redirect: "manual",
      });
      const location = response.headers.get("location");
      const isRedirect = response.status >= 300 && response.status < 400 && location;
      if (!isRedirect) {
        upstream = response;
        break;
      }
      if (hop >= MAX_REDIRECTS) {
        res.status(502).end("Unable to fetch audio");
        return;
      }
      let next;
      try {
        next = new URL(location, current);
      } catch {
        res.status(502).end("Unable to fetch audio");
        return;
      }
      if (!isAllowedAudioUrl(next)) {
        // Cross-host (or protocol-downgrade) redirect: refuse to proxy it.
        res.status(502).end("Unable to fetch audio");
        return;
      }
      current = next;
    }

    res.statusCode = upstream.status;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Accept-Ranges", upstream.headers.get("accept-ranges") || "bytes");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

    for (const header of ["content-type", "content-length", "content-range", "etag", "last-modified"]) {
      const value = upstream.headers.get(header);
      if (value) res.setHeader(header, value);
    }

    if (req.method === "HEAD" || !upstream.body) {
      res.end();
      return;
    }

    const reader = upstream.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
    } finally {
      reader.releaseLock();
    }
    res.end();
  } catch {
    if (!res.headersSent) res.status(502).end("Unable to fetch audio");
    else res.end();
  }
}
