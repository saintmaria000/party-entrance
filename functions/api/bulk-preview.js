import { jsonResponse } from "../lib/jsonResponse.js";

export async function onRequestPost(context) {
  return handlePreview(context);
}

async function handlePreview({ request, env }) {
  try {
    if (!env.ENTRIES) {
      return jsonResponse({ ok: false, message: "ENTRIES(KV) が未設定です。" }, 500);
    }

    const adminPassword = String(env.ADMIN_PASSWORD || "").trim();

    if (!adminPassword) {
      return jsonResponse({ ok: false, message: "ADMIN_PASSWORD が未設定です。" }, 500);
    }

    const body = await request.json().catch(() => null);

    if (!body) {
      return jsonResponse({ ok: false, message: "リクエストが不正です。" }, 400);
    }

    const password = String(body?.password || "").trim();
    const subject = String(body?.subject || "").trim();
    const text = String(body?.text || "").trim();

    if (!password) {
      return jsonResponse({ ok: false, message: "password を入力してください。" }, 401);
    }

    if (password !== adminPassword) {
      return jsonResponse({ ok: false, message: "Unauthorized" }, 401);
    }

    if (!subject) {
      return jsonResponse({ ok: false, message: "件名を入力してください。" }, 400);
    }

    if (!text) {
      return jsonResponse({ ok: false, message: "本文を入力してください。" }, 400);
    }

    const listed = await env.ENTRIES.list({ prefix: "entry:" });
    const emails = [];

    for (const item of listed.keys) {
      const raw = await env.ENTRIES.get(item.name);
      if (!raw) continue;

      try {
        const parsed = JSON.parse(raw);
        const email = String(parsed?.email || "").trim().toLowerCase();
        const subscribed = parsed?.subscribed !== false;

        if (email && subscribed) {
          emails.push(email);
        }
      } catch (_) {}
    }

    const uniqueEmails = [...new Set(emails)];

    return jsonResponse(
      {
        ok: true,
        total: uniqueEmails.length,
        preview: uniqueEmails.slice(0, 10)
      },
      200
    );
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        message: "確認に失敗しました。",
        debug: String(error?.message || error)
      },
      500
    );
  }
}