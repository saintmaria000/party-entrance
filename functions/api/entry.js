export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json().catch(() => null);

    if (!body) {
      return json(
        {
          ok: false,
          message: "リクエストが不正です。"
        },
        400
      );
    }

    const name = String(body?.name || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const turnstileToken = String(body?.turnstileToken || "").trim();

    const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!name) {
      return json(
        {
          ok: false,
          field: "name",
          message: "Nameを入力してください。"
        },
        400
      );
    }

    if (!email) {
      return json(
        {
          ok: false,
          field: "email",
          message: "Mailを入力してください。"
        },
        400
      );
    }

    if (!EMAIL_PATTERN.test(email)) {
      return json(
        {
          ok: false,
          field: "email",
          message: "正しいメールアドレスを入力してください。"
        },
        400
      );
    }

    if (!turnstileToken) {
      return json(
        {
          ok: false,
          field: "turnstile",
          message: "認証を完了してください。"
        },
        400
      );
    }

    if (!env.RESEND_API_KEY) {
      return json(
        {
          ok: false,
          message: "サーバー設定が不正です。"
        },
        500
      );
    }

    if (!env.TURNSTILE_SECRET_KEY) {
      return json(
        {
          ok: false,
          message: "サーバー設定が不正です。"
        },
        500
      );
    }

    if (!env.ENTRIES) {
      return json(
        {
          ok: false,
          message: "保存先の設定が不正です。"
        },
        500
      );
    }

    /* =========================================
       Turnstile verify
    ========================================= */
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
      return json(
        {
          ok: false,
          field: "turnstile",
          message: "認証に失敗しました。再度お試しください。"
        },
        400
      );
    }

    /* =========================================
       重複チェック
       重複時はそのまま成功扱いで遷移させる
    ========================================= */
    const entryKey = `entry:${email}`;
    const existing = await env.ENTRIES.get(entryKey);

    if (existing) {
      return json({ ok: true }, 200);
    }

    /* =========================================
       ここを書き換える
    ========================================= */
    const ADMIN_TO = "shomacco@gmail.com";
    const FROM_EMAIL = "Party Entrance <onboarding@resend.dev>";
    const REPLY_TO = email;

    /* =========================================
       先にKV保存
    ========================================= */
    const createdAt = new Date().toISOString();

    await env.ENTRIES.put(
      entryKey,
      JSON.stringify({
        name,
        email,
        createdAt,
        ip
      })
    );

    /* =========================================
       1. 管理者通知
    ========================================= */
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

      return json(
        {
          ok: false,
          message: "送信に失敗しました。時間をおいて再度お試しください。"
        },
        500
      );
    }

    /* =========================================
       2. 入力したメール宛てに自動返信
       不要ならこのブロックごと消してOK
    ========================================= */
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

      return json(
        {
          ok: false,
          message: "送信に失敗しました。時間をおいて再度お試しください。"
        },
        500
      );
    }

    return json({ ok: true }, 200);
  } catch (error) {
    return json(
      {
        ok: false,
        message: "送信に失敗しました。時間をおいて再度お試しください。"
      },
      500
    );
  }
}

async function verifyTurnstile({ secret, response, remoteip }) {
  const formData = new FormData();
  formData.append("secret", secret);
  formData.append("response", response);

  if (remoteip) {
    formData.append("remoteip", remoteip);
  }

  const verifyResponse = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      body: formData
    }
  );

  if (!verifyResponse.ok) {
    return false;
  }

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