export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  if (request.method === "GET") {
    if (url.pathname === "/api/entries") {
      return handleList(context);
    }

    return new Response(
      JSON.stringify({ ok: true, route: "/api/entry", method: "GET" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" }
      }
    );
  }

  if (request.method === "POST") {
    if (url.pathname === "/api/entry") {
      return handlePost(context);
    }

    return json({ ok: false, message: "Not Found" }, 404);
  }

  return new Response("Method Not Allowed", {
    status: 405
  });
}

async function handlePost({ request, env }) {
  try {
    const body = await request.json().catch(() => null);

    if (!body) {
      return json({ ok: false, message: "リクエストが不正です。" }, 400);
    }

    const name = String(body?.name || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const turnstileToken = String(body?.turnstileToken || "").trim();

    const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!name) {
      return json({ ok: false, field: "name", message: "Nameを入力してください。" }, 400);
    }

    if (!email) {
      return json({ ok: false, field: "email", message: "Mailを入力してください。" }, 400);
    }

    if (!EMAIL_PATTERN.test(email)) {
      return json({ ok: false, field: "email", message: "正しいメールアドレスを入力してください。" }, 400);
    }

    if (!turnstileToken) {
      return json({ ok: false, field: "turnstile", message: "認証を完了してください。" }, 400);
    }

    if (!env.RESEND_API_KEY) {
      return json({ ok: false, message: "RESEND_API_KEY が未設定です。" }, 500);
    }

    if (!env.TURNSTILE_SECRET_KEY) {
      return json({ ok: false, message: "TURNSTILE_SECRET_KEY が未設定です。" }, 500);
    }

    if (!env.ENTRIES) {
      return json({ ok: false, message: "ENTRIES(KV) が未設定です。" }, 500);
    }

    const ip =
      request.headers.get("CF-Connecting-IP") ||
      request.headers.get("x-forwarded-for") ||
      "";

    const turnstileOk = await verifyTurnstile({
      secret: env.TURNSTILE_SECRET_KEY,
      response: turnstileToken,
      remoteip: ip
    });

    if (!turnstileOk) {
      return json({ ok: false, field: "turnstile", message: "認証に失敗しました。再度お試しください。" }, 400);
    }

    const entryKey = `entry:${email}`;
    const existing = await env.ENTRIES.get(entryKey);

    if (existing) {
      return json({ ok: true, duplicated: true }, 200);
    }

    const ADMIN_TO = "shomacco@gmail.com";
    const FROM_EMAIL = "Party Entrance <onboarding@resend.dev>";
    const REPLY_TO = email;
    const createdAt = new Date().toISOString();

    const record = {
      name,
      email,
      createdAt,
      ip
    };

    await env.ENTRIES.put(entryKey, JSON.stringify(record));

    const adminResult = await sendEmail(env.RESEND_API_KEY, {
      from: FROM_EMAIL,
      to: [ADMIN_TO],
      reply_to: REPLY_TO,
      subject: "New Party Entry",
      text:
        `New entry received.\n\n` +
        `Name: ${name}\n` +
        `Mail: ${email}\n` +
        `Time: ${createdAt}\n`,
      html:
        `<p>New entry received.</p>` +
        `<p><strong>Name:</strong> ${escapeHtml(name)}<br>` +
        `<strong>Mail:</strong> ${escapeHtml(email)}<br>` +
        `<strong>Time:</strong> ${escapeHtml(createdAt)}</p>`
    });

    if (!adminResult.ok) {
      await env.ENTRIES.delete(entryKey);
      return json({ ok: false, message: "管理者通知の送信に失敗しました。" }, 500);
    }

    const userResult = await sendEmail(env.RESEND_API_KEY, {
      from: FROM_EMAIL,
      to: [email],
      subject: "Party Entrance",
      text:
        `You are invited.\n\n` +
        `Thank you for your entry.\n` +
        `Your submission has been received.\n`,
      html:
        `<p>You are invited.</p>` +
        `<p>Thank you for your entry.<br>` +
        `Your submission has been received.</p>`
    });

    if (!userResult.ok) {
      await env.ENTRIES.delete(entryKey);
      return json({ ok: false, message: "自動返信の送信に失敗しました。" }, 500);
    }

    return json({ ok: true }, 200);
  } catch (error) {
    return json({ ok: false, message: "送信に失敗しました。時間をおいて再度お試しください。" }, 500);
  }
}

async function handleList({ env, request }) {
  try {
    if (!env.ENTRIES) {
      return json({ ok: false, message: "ENTRIES(KV) が未設定です。" }, 500);
    }

    // 簡易保護
    const url = new URL(request.url);
    const password = String(url.searchParams.get("password") || "").trim();

    if (!password) {
      return json({ ok: false, message: "password が必要です。" }, 401);
    }

    if (password !== "admin1234") {
      return json({ ok: false, message: "Unauthorized" }, 401);
    }

    const listed = await env.ENTRIES.list({ prefix: "entry:" });
    const entries = [];

    for (const item of listed.keys) {
      const raw = await env.ENTRIES.get(item.name);
      if (!raw) continue;

      try {
        const parsed = JSON.parse(raw);
        entries.push(parsed);
      } catch (_) {
        // 壊れたデータは無視
      }
    }

    entries.sort((a, b) => {
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });

    return json(
      {
        ok: true,
        total: entries.length,
        entries
      },
      200
    );
  } catch (error) {
    return json({ ok: false, message: "一覧の取得に失敗しました。" }, 500);
  }
}

async function verifyTurnstile({ secret, response, remoteip }) {
  const formData = new FormData();
  formData.append("secret", secret);
  formData.append("response", response);
  if (remoteip) formData.append("remoteip", remoteip);

  const verifyResponse = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    { method: "POST", body: formData }
  );

  if (!verifyResponse.ok) return false;
  const verifyData = await verifyResponse.json().catch(() => null);
  return Boolean(verifyData?.success);
}

async function sendEmail(apiKey, payload) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));

  return {
    ok: response.ok,
    status: response.status,
    data
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}