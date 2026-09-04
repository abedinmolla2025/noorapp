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

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers,
      redirect: "follow",
    });

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
