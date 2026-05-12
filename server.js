import express from 'express';

const TARGET_BASE = (process.env.TARGET_DOMAIN || "").replace(/\/$/, "");
const PORT = process.env.PORT || 8080;

const STRIP_HEADERS = new Set([
  "host", "connection", "keep-alive", "proxy-authenticate",
  "proxy-authorization", "te", "trailer", "transfer-encoding",
  "upgrade", "forwarded", "x-forwarded-host", "x-forwarded-proto", "x-forwarded-port"
]);

const app = express();

app.all('*', async (req, res) => {
  if (!TARGET_BASE) {
    return res.status(500).send("Misconfigured: TARGET_DOMAIN is not set");
  }

  try {
    const targetUrl = TARGET_BASE + req.originalUrl;

    const headers = new Headers();
    let clientIp = null;

    for (const [key, value] of Object.entries(req.headers)) {
      const k = key.toLowerCase();
      if (STRIP_HEADERS.has(k)) continue;
      if (k === "x-real-ip") { clientIp = value; continue; }
      if (k === "x-forwarded-for" && !clientIp) { clientIp = value; continue; }
      headers.set(k, value);
    }
    if (clientIp) headers.set("x-forwarded-for", clientIp);

    const fetchOptions = {
      method: req.method,
      headers: headers,
      redirect: "manual"
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
      fetchOptions.body = req;
    }

    const upstream = await fetch(targetUrl, fetchOptions);

    const responseHeaders = {};
    for (const [key, value] of upstream.headers) {
      if (key.toLowerCase() !== "transfer-encoding") {
        responseHeaders[key] = value;
      }
    }

    res.status(upstream.status).set(responseHeaders);
    upstream.body.pipe(res);
  } catch (error) {
    res.status(502).send("Bad Gateway: Relay Failed");
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Relay running on port ${PORT}`);
  console.log(`Target: ${TARGET_BASE || "NOT SET"}`);
});