import { resendEmail } from "../lib/resendEmail.js";
import { turnstileVerify } from "../lib/turnstileVerify.js";
import { jsonResponse } from "../lib/jsonResponse.js";
import { escapeHtml } from "../lib/escapeHtml.js";

export async function onRequest(context) {
  const { request } = context;

  if (request.method === "GET") {
    return jsonResponse(
      { ok: true, route: "/api/entry", method: "GET" },
      200
    );
  }

  if (request.method === "POST") {
    return handlePost(context);
  }

  return new Response("Method Not Allowed", {
    status: 405
  });
}

async function handlePost({ request, env }) {
  try {
    const body = await request.json().catch(() => null);

    if (!body) {
      return jsonResponse(
        { ok: false, message: "リクエストが不正です。" },
        400
      );
    }

    const name = String(body?.name || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const turnstileToken = String(body?.turnstileToken || "").trim();

    const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!name) {
      return jsonResponse(
        { ok: false, field: "name", message: "Nameを入力してください。" },
        400
      );
    }

    if (!email) {
      return jsonResponse(
        { ok: false, field: "email", message: "Mailを入力してください。" },
        400
      );
    }

    if (!EMAIL_PATTERN.test(email)) {
      return jsonResponse(
        {
          ok: false,
          field: "email",
          message: "正しいメールアドレスを入力してください。"
        },
        400
      );
    }

    if (!turnstileToken) {
      return jsonResponse(
        { ok: false, field: "turnstile", message: "認証を完了してください。" },
        400
      );
    }

    if (!env.RESEND_API_KEY) {
      return jsonResponse(
        { ok: false, message: "RESEND_API_KEY が未設定です。" },
        500
      );
    }

    if (!env.TURNSTILE_SECRET_KEY) {
      return jsonResponse(
        { ok: false, message: "TURNSTILE_SECRET_KEY が未設定です。" },
        500
      );
    }

    if (!env.ENTRIES) {
      return jsonResponse(
        { ok: false, message: "ENTRIES(KV) が未設定です。" },
        500
      );
    }

    if (!env.FROM_EMAIL) {
      return jsonResponse(
        { ok: false, message: "FROM_EMAIL が未設定です。" },
        500
      );
    }

    const ip =
      request.headers.get("CF-Connecting-IP") ||
      request.headers.get("x-forwarded-for") ||
      "";

    const isTurnstileValid = await turnstileVerify({
      secret: env.TURNSTILE_SECRET_KEY,
      response: turnstileToken,
      remoteip: ip
    });

    if (!isTurnstileValid) {
      return jsonResponse(
        {
          ok: false,
          field: "turnstile",
          message: "認証に失敗しました。再度お試しください。"
        },
        400
      );
    }

    const entryKey = `entry:${email}`;
    const existing = await env.ENTRIES.get(entryKey);

    if (existing) {
      return jsonResponse({ ok: true, duplicated: true }, 200);
    }

    const ADMIN_TO = "shomacco@gmail.com";
    const FROM_EMAIL = env.FROM_EMAIL;
    const REPLY_TO = email;
    const createdAt = new Date().toISOString();

    const record = {
      name,
      email,
      createdAt,
      ip,
      subscribed: true
    };

    await env.ENTRIES.put(entryKey, JSON.stringify(record));

    const adminMailResult = await resendEmail(env.RESEND_API_KEY, {
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

    if (!adminMailResult.ok) {
      await env.ENTRIES.delete(entryKey);
      return jsonResponse(
        { ok: false, message: "管理者通知の送信に失敗しました。" },
        500
      );
    }

    const userMailResult = await resendEmail(env.RESEND_API_KEY, {
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

    if (!userMailResult.ok) {
      await env.ENTRIES.delete(entryKey);
      return jsonResponse(
        { ok: false, message: "自動返信の送信に失敗しました。" },
        500
      );
    }

    return jsonResponse({ ok: true }, 200);
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        message: "送信に失敗しました。時間をおいて再度お試しください。"
      },
      500
    );
  }
}