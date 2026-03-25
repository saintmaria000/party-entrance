(() => {
  "use strict";

  const form = document.getElementById("bulkForm");
  const passwordInput = document.getElementById("bulkPassword");
  const subjectInput = document.getElementById("bulkSubject");
  const textInput = document.getElementById("bulkText");
  const submitButton = document.getElementById("bulkSubmit");
  const message = document.getElementById("bulkMessage");
  const result = document.getElementById("bulkResult");
  const total = document.getElementById("bulkTotal");
  const success = document.getElementById("bulkSuccess");
  const fail = document.getElementById("bulkFail");

  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const password = passwordInput.value.trim();
    const subject = subjectInput.value.trim();
    const text = textInput.value.trim();

    clearMessage();
    result.hidden = true;

    if (!password) {
      setMessage("password を入力してください。", "error");
      return;
    }

    if (!subject) {
      setMessage("件名を入力してください。", "error");
      return;
    }

    if (!text) {
      setMessage("本文を入力してください。", "error");
      return;
    }

    setLoading(true);
    setMessage("送信中...", "");

    try {
      const response = await fetch("/api/bulk-send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          password,
          subject,
          text
        })
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok) {
        setMessage(data?.message || "一斉送信に失敗しました。", "error");
        return;
      }

      total.textContent = String(data.total || 0);
      success.textContent = String(data.successCount || 0);
      fail.textContent = String(data.failCount || 0);
      result.hidden = false;

      setMessage("一斉送信が完了しました。", "success");
    } catch (error) {
      setMessage("通信に失敗しました。", "error");
    } finally {
      setLoading(false);
    }
  });

  function setLoading(isLoading) {
    submitButton.disabled = isLoading;
    passwordInput.disabled = isLoading;
    subjectInput.disabled = isLoading;
    textInput.disabled = isLoading;
    submitButton.textContent = isLoading ? "Sending..." : "Send";
  }

  function setMessage(text, type = "") {
    message.textContent = text;
    message.className = "bulk-message";

    if (type === "error") {
      message.classList.add("is-error");
    }

    if (type === "success") {
      message.classList.add("is-success");
    }
  }

  function clearMessage() {
    message.textContent = "";
    message.className = "bulk-message";
  }
})();