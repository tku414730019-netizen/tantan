/**
 * 毯毯｜Cloudflare Pages 進階模式 _worker.js
 * 一個網址同時提供「網頁」與「ChatPDF 中轉」：
 *   - /v1/chats/message → 加上金鑰與 Source ID 後轉給 ChatPDF
 *   - 其他路徑          → 回傳網頁本身（index.html）
 *
 * 需要在 Pages 專案的「設定 → 變數和機密」新增兩個（選 Secret）：
 *   CHATPDF_KEY  你的 ChatPDF API Key
 *   SOURCE_ID    攻略 PDF 的 Source ID（src_ 或 cha_ 開頭）
 * 金鑰只存在伺服器端，網頁裡完全沒有。
 */
const CHATPDF_URL = "https://api.chatpdf.com/v1/chats/message";
const MAX_MESSAGES = 6;      // ChatPDF 單次最多 6 則
const MAX_CHARS = 2000;      // 單則訊息長度上限，避免被拿來塞大量內容

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 不是 API 路徑 → 回傳網頁
    if (url.pathname !== "/v1/chats/message") return env.ASSETS.fetch(request);

    // 只接受來自本站（或本機檔案 file://，其 Origin 為 "null"）的呼叫
    const origin = request.headers.get("Origin");
    const allowed = !origin || origin === url.origin || origin === "null";
    const cors = allowed && origin
      ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin",
          "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" }
      : {};

    if (!allowed) return json({ error: "不允許的來源" }, 403, cors);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return json({ error: "只接受 POST" }, 405, cors);
    if (!env.CHATPDF_KEY || !env.SOURCE_ID) return json({ error: "伺服器尚未設定 CHATPDF_KEY / SOURCE_ID" }, 500, cors);

    // 只取需要的欄位並整理；sourceId 一律由伺服器指定，使用者無法換成別份 PDF
    let body;
    try { body = await request.json(); } catch { return json({ error: "請求格式錯誤" }, 400, cors); }
    const messages = (Array.isArray(body.messages) ? body.messages : [])
      .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-MAX_MESSAGES)
      .map(m => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
    if (!messages.length || messages[messages.length - 1].role !== "user") {
      return json({ error: "沒有有效的提問" }, 400, cors);
    }

    const res = await fetch(CHATPDF_URL, {
      method: "POST",
      headers: { "x-api-key": env.CHATPDF_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ sourceId: env.SOURCE_ID, messages })
    });
    return new Response(res.body, {
      status: res.status,
      headers: { ...cors, "Content-Type": "application/json" }
    });
  }
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...cors, "Content-Type": "application/json" }
  });
}
