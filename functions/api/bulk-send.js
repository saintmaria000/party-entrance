import { resendEmail } from "../lib/resendEmail.js";
import { jsonResponse } from "../lib/jsonResponse.js";
import { escapeHtml } from "../lib/escapeHtml.js";

export async function onRequestPost(context) {
  return handleSend(context);
}

async function handleSend({ request, env }) {
  try {
    if (!env.ENTRIES) {
      return jsonResponse({ ok: false, message: "ENTRIES(KV) が未設定です。" }, 500);
    }

    if (!env.RESEND_API_KEY) {
      return jsonResponse({ ok: false, message: "RESEND_API_KEY が未設定です。" }, 500);
    }

    if (!env.FROM_EMAIL) {
      return jsonResponse({ ok: false, message: "FROM_EMAIL が未設定です。" }, 500);
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
    const confirmed = Boolean(body?.confirmed);

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

    if (!confirmed) {
      return jsonResponse({ ok: false, message: "確認チェックが必要です。" }, 400);
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

    if (!uniqueEmails.length) {
      return jsonResponse({ ok: false, message: "送信対象がありません。" }, 400);
    }

    let success = 0;
    let fail = 0;

    for (const email of uniqueEmails) {
      const result = await resendEmail(env.RESEND_API_KEY, {
        from: env.FROM_EMAIL,
        to: [email],
        subject,
        text,
        html: `<div style="white-space:pre-wrap;">${escapeHtml(text)}</div>`
      });

      if (result.ok) success += 1;
      else fail += 1;
    }

    return jsonResponse(
      {
        ok: true,
        total: uniqueEmails.length,
        success,
        fail
      },
      200
    );
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        message: "送信失敗",
        debug: String(error?.message || error)
      },
      500
    );
  }
}