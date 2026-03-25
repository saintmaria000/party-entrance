import { resendEmail } from "../lib/resendEmail.js";
import { jsonResponse } from "../lib/jsonResponse.js";
import { escapeHtml } from "../lib/escapeHtml.js";

export async function onRequest(context) {
  const { request } = context;

  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  return handleBulkSend(context);
}

async function handleBulkSend({ request, env }) {
  try {
    if (!env.ENTRIES) {
      return jsonResponse(
        { ok: false, message: "ENTRIES(KV) が未設定です。" },
        500
      );
    }

    if (!env.RESEND_API_KEY) {
      return jsonResponse(
        { ok: false, message: "RESEND_API_KEY が未設定です。" },
        500
      );
    }

    const body = await request.json().catch(() => null);

    if (!body) {
      return jsonResponse(
        { ok: false, message: "リクエストが不正です。" },
        400
      );
    }

    const password = String(body?.password || "").trim();
    const subject = String(body?.subject || "").trim();
    const text = String(body?.text || "").trim();

    const adminPassword = String(env.ADMIN_PASSWORD || "admin1234").trim();

    if (!password) {
      return jsonResponse(
        { ok: false, message: "password を入力してください。" },
        401
      );
    }

    if (password !== adminPassword) {
      return jsonResponse(
        { ok: false, message: "Unauthorized" },
        401
      );
    }

    if (!subject) {
      return jsonResponse(
        { ok: false, field: "subject", message: "件名を入力してください。" },
        400
      );
    }

    if (!text) {
      return jsonResponse(
        { ok: false, field: "text", message: "本文を入力してください。" },
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
        const email = String(parsed?.email || "").trim().toLowerCase();
        if (email) {
          emails.push(email);
        }
      } catch (_) {
        // ignore
      }
    }

    const uniqueEmails = [...new Set(emails)];

    if (!uniqueEmails.length) {
      return jsonResponse(
        { ok: false, message: "送信対象のメールアドレスがありません。" },
        400
      );
    }

    const FROM_EMAIL =
      env.FROM_EMAIL || "Party Entrance <noreply@yourdomain.com>";

    const html =
      `<div style="white-space:pre-wrap;">${escapeHtml(text)}</div>`;

    const results = [];
    let successCount = 0;
    let failCount = 0;

    for (const email of uniqueEmails) {
      const result = await resendEmail(env.RESEND_API_KEY, {
        from: FROM_EMAIL,
        to: [email],
        subject,
        text,
        html
      });

      if (result.ok) {
        successCount += 1;
      } else {
        failCount += 1;
      }

      results.push({
        email,
        ok: result.ok,
        status: result.status
      });
    }

    return jsonResponse(
      {
        ok: true,
        total: uniqueEmails.length,
        successCount,
        failCount,
        results
      },
      200
    );
  } catch (error) {
    return jsonResponse(
      { ok: false, message: "一斉送信に失敗しました。" },
      500
    );
  }
}