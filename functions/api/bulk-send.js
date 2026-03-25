import { resendEmail } from "../lib/resendEmail.js";
import { jsonResponse } from "../lib/jsonResponse.js";
import { escapeHtml } from "../lib/escapeHtml.js";

export async function onRequest(context) {
  const { request } = context;

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  return handleSend(context);
}

async function handleSend({ request, env }) {
  try {
    if (!env.ENTRIES || !env.RESEND_API_KEY || !env.FROM_EMAIL) {
      return jsonResponse(
        { ok: false, message: "環境変数不足" },
        500
      );
    }

    const adminPassword = String(env.ADMIN_PASSWORD || "").trim();

    const body = await request.json().catch(() => null);

    const password = String(body?.password || "").trim();
    const subject = String(body?.subject || "").trim();
    const text = String(body?.text || "").trim();
    const confirmed = Boolean(body?.confirmed);

    if (password !== adminPassword) {
      return jsonResponse(
        { ok: false, message: "Unauthorized" },
        401
      );
    }

    if (!subject || !text) {
      return jsonResponse(
        { ok: false, message: "件名・本文が必要です。" },
        400
      );
    }

    if (!confirmed) {
      return jsonResponse(
        { ok: false, message: "確認チェックが必要です。" },
        400
      );
    }

    const listed = await env.ENTRIES.list({ prefix: "entry:" });
    const emails = [];

    for (const item of listed.keys) {
      const raw = await env.ENTRIES.get(item.name);
      if (!raw) continue;

      try {
        const parsed = JSON.parse(raw);
        if (parsed?.email && parsed?.subscribed !== false) {
          emails.push(parsed.email);
        }
      } catch (_) {}
    }

    const uniqueEmails = [...new Set(emails)];

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

      if (result.ok) success++;
      else fail++;
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
  } catch {
    return jsonResponse(
      { ok: false, message: "送信失敗" },
      500
    );
  }
}