import { jsonResponse } from "../lib/jsonResponse.js";

export async function onRequest(context) {
  const { request } = context;

  if (request.method !== "GET") {
    return new Response("Method Not Allowed", {
      status: 405
    });
  }

  return handleList(context);
}

async function handleList({ env, request }) {
  try {
    if (!env.ENTRIES) {
      return jsonResponse(
        { ok: false, message: "ENTRIES(KV) が未設定です。" },
        500
      );
    }

    const adminPassword = String(env.ADMIN_PASSWORD || "").trim();

    if (!adminPassword) {
      return jsonResponse(
        { ok: false, message: "ADMIN_PASSWORD が未設定です。" },
        500
      );
    }

    const url = new URL(request.url);
    const password = String(url.searchParams.get("password") || "").trim();

    if (!password) {
      return jsonResponse(
        { ok: false, message: "password が必要です。" },
        401
      );
    }

    if (password !== adminPassword) {
      return jsonResponse(
        { ok: false, message: "Unauthorized" },
        401
      );
    }

    const listed = await env.ENTRIES.list({ prefix: "entry:" });
    const entries = [];

    for (const item of listed.keys) {
      const raw = await env.ENTRIES.get(item.name);
      if (!raw) continue;

      try {
        const parsed = JSON.parse(raw);
        entries.push(parsed);
      } catch (_) {}
    }

    entries.sort((a, b) => {
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });

    return jsonResponse(
      {
        ok: true,
        total: entries.length,
        entries
      },
      200
    );
  } catch (error) {
    return jsonResponse(
      { ok: false, message: "一覧の取得に失敗しました。" },
      500
    );
  }
}