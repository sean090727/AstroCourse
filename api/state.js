const STATE_PATH = "astrocourse/state.json";

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  try {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      if (req.method === "GET") {
        return send(res, 200, {
          ok: true,
          source: "empty",
          warning: "Vercel Blob is not configured yet.",
          data: null
        });
      }
      return send(res, 503, {
        ok: false,
        error: "Vercel Blob is not configured. Connect Blob Storage in Vercel first."
      });
    }

    const { put, list } = await import("@vercel/blob");

    if (req.method === "GET") {
      const found = await list({ prefix: STATE_PATH, limit: 1, token });
      const blob = found.blobs.find(item => item.pathname === STATE_PATH);
      if (!blob) {
        return send(res, 200, { ok: true, source: "empty", data: null });
      }
      const blobRes = await fetch(blob.url, { cache: "no-store" });
      if (!blobRes.ok) throw new Error(`Blob read failed: ${blobRes.status}`);
      return send(res, 200, { ok: true, source: "blob", data: await blobRes.json() });
    }

    if (req.method === "POST") {
      const body = await readBody(req);
      const data = body.data || body;
      if (!data || typeof data !== "object") {
        return send(res, 400, { ok: false, error: "Invalid state payload." });
      }
      const blob = await put(STATE_PATH, JSON.stringify(data), {
        access: "public",
        allowOverwrite: true,
        contentType: "application/json",
        token
      });
      return send(res, 200, {
        ok: true,
        source: "blob",
        savedAt: new Date().toISOString(),
        url: blob.url
      });
    }

    send(res, 405, { ok: false, error: "Method not allowed." });
  } catch (error) {
    send(res, 500, { ok: false, error: error.message || "Unknown server error." });
  }
};
