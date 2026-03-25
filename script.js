(() => {
  "use strict";

  console.log("[Party Entrance] script loaded");

  /* =========================================================
     Config
  ========================================================= */
  const CONFIG = {
    endpoint: "https://party-entrance-api.ukyoiflm.workers.dev/api/entry",
    method: "POST",
    redirectUrl: "message.html",
    submitTimeout: 15000,
    globalErrorMessage: "送信に失敗しました。時間をおいて再度お試しください。",
    submittingLabel: "Sending...",
    defaultLabel: "Enter"
  };

  console.log("[Party Entrance] config:", CONFIG);

  /* =========================================================
     DOM
  ========================================================= */
  const form = document.getElementById("inviteForm");
  const globalError = document.getElementById("globalError");
  const submitBtn = document.getElementById("submitBtn");

  const nameInput = document.getElementById("name");
  const emailInput = document.getElementById("email");

  const nameError = document.getElementById("nameError");
  const emailError = document.getElementById("emailError");
  const turnstileError = document.getElementById("turnstileError");

  console.log("[Party Entrance] DOM refs:", {
    form,
    globalError,
    submitBtn,
    nameInput,
    emailInput,
    nameError,
    emailError,
    turnstileError
  });

  if (!form) {
    console.error("[Party Entrance] inviteForm not found");
    return;
  }

  if (!nameInput || !emailInput || !submitBtn) {
    console.error("[Party Entrance] required form elements missing", {
      nameInput,
      emailInput,
      submitBtn
    });
    return;
  }

  /* =========================================================
     State
  ========================================================= */
  let isSubmitting = false;
  const defaultButtonLabel = submitBtn.textContent || CONFIG.defaultLabel;

  /* =========================================================
     Util
  ========================================================= */
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function normalize(value) {
    const normalized = String(value || "").trim();
    console.log("[Party Entrance] normalize:", { raw: value, normalized });
    return normalized;
  }

  function setText(el, text) {
    if (!el) {
      console.warn("[Party Entrance] setText target not found:", text);
      return;
    }
    el.textContent = text || "";
    console.log("[Party Entrance] setText:", {
      targetId: el.id || "(no id)",
      text
    });
  }

  function clearErrors() {
    console.log("[Party Entrance] clearErrors");
    setText(nameError, "");
    setText(emailError, "");
    setText(turnstileError, "");
    setText(globalError, "");
  }

  function clearFieldError(field) {
    if (field === "name") setText(nameError, "");
    if (field === "email") setText(emailError, "");
    if (field === "turnstile") setText(turnstileError, "");
  }

  function setSubmitting(state) {
    isSubmitting = state;
    submitBtn.disabled = state;
    submitBtn.setAttribute("aria-disabled", String(state));
    submitBtn.textContent = state ? CONFIG.submittingLabel : defaultButtonLabel;

    console.log("[Party Entrance] setSubmitting:", {
      isSubmitting: state
    });
  }

  function getTurnstileToken() {
    const tokenInput = form.querySelector('[name="cf-turnstile-response"]');
    const token = normalize(tokenInput ? tokenInput.value : "");

    console.log("[Party Entrance] turnstile token:", {
      exists: !!token,
      length: token.length
    });

    return token;
  }

  function getTurnstileWidget() {
    return document.querySelector(".cf-turnstile");
  }

  function resetTurnstile() {
    try {
      if (!window.turnstile || typeof window.turnstile.reset !== "function") {
        console.warn("[Party Entrance] turnstile api not available");
        return;
      }

      const widget = getTurnstileWidget();
      if (!widget) {
        console.warn("[Party Entrance] turnstile widget not found");
        return;
      }

      window.turnstile.reset(widget);
      console.log("[Party Entrance] turnstile reset done");
    } catch (error) {
      console.warn("[Party Entrance] turnstile reset failed:", error);
    }
  }

  function handleApiError(payload, fallbackMessage) {
    const field = normalize(payload?.field);
    const message = normalize(payload?.message) || fallbackMessage || CONFIG.globalErrorMessage;

    console.error("[Party Entrance] handleApiError:", {
      field,
      message,
      payload
    });

    if (field === "name") {
      setText(nameError, message);
      return;
    }

    if (field === "email") {
      setText(emailError, message);
      return;
    }

    if (field === "turnstile") {
      setText(turnstileError, message);
      return;
    }

    setText(globalError, message);
  }

  /* =========================================================
     Validation
  ========================================================= */
  function validate() {
    console.log("[Party Entrance] validate start");

    const name = normalize(nameInput.value);
    const email = normalize(emailInput.value);
    const turnstileToken = getTurnstileToken();

    let valid = true;

    if (!name) {
      console.warn("[Party Entrance] name validation failed");
      setText(nameError, "Nameを入力してください。");
      valid = false;
    }

    if (!email) {
      console.warn("[Party Entrance] email validation failed: empty");
      setText(emailError, "Mailを入力してください。");
      valid = false;
    } else if (!EMAIL_PATTERN.test(email)) {
      console.warn("[Party Entrance] email validation failed: invalid format", {
        email
      });
      setText(emailError, "正しいメールアドレスを入力してください。");
      valid = false;
    }

    if (!turnstileToken) {
      console.warn("[Party Entrance] turnstile validation failed");
      setText(turnstileError, "認証を完了してください。");
      valid = false;
    }

    console.log("[Party Entrance] validate result:", {
      valid,
      name,
      email,
      hasTurnstileToken: !!turnstileToken
    });

    return { valid, name, email, turnstileToken };
  }

  /* =========================================================
     API
  ========================================================= */
  async function send(data) {
    console.log("[Party Entrance] send start:", {
      ...data,
      turnstileToken: data.turnstileToken ? "[masked]" : ""
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      console.error("[Party Entrance] request timeout");
      controller.abort();
    }, CONFIG.submitTimeout);

    try {
      const res = await fetch(CONFIG.endpoint, {
        method: CONFIG.method,
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(data),
        signal: controller.signal
      });

      console.log("[Party Entrance] fetch response:", {
        ok: res.ok,
        status: res.status,
        statusText: res.statusText
      });

      const json = await res.json().catch((error) => {
        console.error("[Party Entrance] response json parse failed:", error);
        return {};
      });

      console.log("[Party Entrance] response body:", json);

      if (!res.ok || json.ok === false) {
        const error = new Error(json.message || CONFIG.globalErrorMessage);
        error.payload = json;
        error.status = res.status;
        console.error("[Party Entrance] API returned error:", {
          status: res.status,
          json
        });
        throw error;
      }

      console.log("[Party Entrance] send success");
      return json;
    } catch (error) {
      console.error("[Party Entrance] send failed:", error);

      if (error.name === "AbortError") {
        const timeoutError = new Error("通信がタイムアウトしました。時間をおいて再度お試しください。");
        timeoutError.payload = { message: timeoutError.message };
        throw timeoutError;
      }

      throw error;
    } finally {
      clearTimeout(timeout);
      console.log("[Party Entrance] send finished");
    }
  }

  /* =========================================================
     Events
  ========================================================= */
  nameInput.addEventListener("input", () => {
    console.log("[Party Entrance] name input event:", nameInput.value);
    clearFieldError("name");
    setText(globalError, "");
  });

  emailInput.addEventListener("input", () => {
    console.log("[Party Entrance] email input event:", emailInput.value);
    clearFieldError("email");
    setText(globalError, "");
  });

  form.addEventListener("input", (e) => {
    const target = e.target;
    if (!target) return;

    if (target.name === "cf-turnstile-response") {
      console.log("[Party Entrance] turnstile token input changed");
      clearFieldError("turnstile");
      setText(globalError, "");
    }
  });

  window.addEventListener("load", () => {
    console.log("[Party Entrance] window load");
    const token = getTurnstileToken();
    if (token) {
      clearFieldError("turnstile");
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    console.log("[Party Entrance] submit event fired", {
      isSubmitting
    });

    if (isSubmitting) {
      console.warn("[Party Entrance] submit blocked: already submitting");
      return;
    }

    clearErrors();

    const result = validate();

    if (!result.valid) {
      console.warn("[Party Entrance] submit stopped: validation failed", result);
      return;
    }

    try {
      setSubmitting(true);

      await send({
        name: result.name,
        email: result.email,
        turnstileToken: result.turnstileToken
      });

      console.log("[Party Entrance] redirecting to:", CONFIG.redirectUrl);
      window.location.href = CONFIG.redirectUrl;
    } catch (err) {
      console.error("[Party Entrance] submit catch:", err);

      handleApiError(
        err?.payload,
        err && err.message ? err.message : CONFIG.globalErrorMessage
      );

      const errorField = normalize(err?.payload?.field);
      if (errorField === "turnstile" || !errorField) {
        resetTurnstile();
      }
    } finally {
      setSubmitting(false);
      console.log("[Party Entrance] submit finished");
    }
  });
})();