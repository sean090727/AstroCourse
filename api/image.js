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

function decodeDataUrl(dataUrl) {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/.exec(dataUrl || "");
  if (!match || !match[2]) throw new Error("Invalid image data.");
  return {
    contentType: match[1] || "image/jpeg",
    buffer: Buffer.from(match[3], "base64")
  };
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== "POST") return send(res, 405, { ok: false, error: "Method not allowed." });
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) return send(res, 503, { ok: false, error: "Vercel Blob is not configured." });

    const body = await readBody(req);
    const { dataUrl, name, articleId } = body || {};
    const decoded = decodeDataUrl(dataUrl);
    const safeName = String(name || "image.jpg").replace(/[^\w.\-가-힣]/g, "_").slice(-80);
    const safeArticle = String(articleId || "article").replace(/[^\w.\-]/g, "_").slice(0, 80);
    const pathname = `astrocourse/images/${safeArticle}/${Date.now()}-${safeName}`;

    const { put } = await import("@vercel/blob");
    const blob = await put(pathname, decoded.buffer, {
      access: "public",
      allowOverwrite: false,
      contentType: decoded.contentType,
      token
    });

    return send(res, 200, {
      ok: true,
      url: blob.url,
      pathname: blob.pathname,
      contentType: decoded.contentType
    });
  } catch (error) {
    return send(res, 500, { ok: false, error: error.message || "Image upload failed." });
  }
};
