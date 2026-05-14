// main.js - WebSocket Passthrough برای پشتیبانی از xhttp
async function handleRequest(req) {
  const url = new URL(req.url);

  // فقط درخواست‌هایی که درخواست upgrade به WebSocket دارند پردازش کن
  if (req.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    // برای درخواست‌های عادی HTTP، یک صفحه ساده نشان بده
    return new Response("Deno Deploy WebSocket Proxy is running.", { status: 200 });
  }

  const targetUrl = Deno.env.get("TARGET_DOMAIN");
  if (!targetUrl) {
    return new Response("TARGET_DOMAIN not set", { status: 500 });
  }

  try {
    // ایجاد یک WebSocket بین کاربر و Deno Deploy
    const upgrade = Deno.upgradeWebSocket(req);
    const clientWs = upgrade.socket;

    // ایجاد یک WebSocket بین Deno Deploy و VPS شما
    const targetWs = new WebSocket(targetUrl);

    // پل زدن دوطرفه (Bidirectional)
    targetWs.onopen = () => {
      clientWs.onmessage = (event) => targetWs.send(event.data);
      targetWs.onmessage = (event) => clientWs.send(event.data);
    };

    targetWs.onerror = (err) => {
      console.error("Target WebSocket error:", err);
      clientWs.close();
    };

    clientWs.onerror = (err) => {
      console.error("Client WebSocket error:", err);
      targetWs.close();
    };

    clientWs.onclose = () => targetWs.close();
    targetWs.onclose = () => clientWs.close();

    return upgrade.response;
  } catch (err) {
    console.error("Upgrade error:", err);
    return new Response("WebSocket upgrade failed", { status: 500 });
  }
}

Deno.serve(handleRequest);