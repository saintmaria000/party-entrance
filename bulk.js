(() => {
  "use strict";

  const form = document.getElementById("bulkForm");
  const message = document.getElementById("bulkMessage");
  const result = document.getElementById("bulkResult");

  const total = document.getElementById("bulkTotal");
  const success = document.getElementById("bulkSuccess");
  const fail = document.getElementById("bulkFail");

  const password = document.getElementById("bulkPassword");
  const subject = document.getElementById("bulkSubject");
  const text = document.getElementById("bulkText");
  const submit = document.getElementById("bulkSubmit");

  const previewBox = document.getElementById("bulkPreviewBox");
  const previewTotal = document.getElementById("bulkPreviewTotal");
  const previewList = document.getElementById("bulkPreviewList");

  if (
    !form ||
    !message ||
    !result ||
    !total ||
    !success ||
    !fail ||
    !password ||
    !subject ||
    !text ||
    !submit ||
    !previewBox ||
    !previewTotal ||
    !previewList
  ) {
    console.error("bulk.js: required elements not found");
    return;
  }

  let confirmed = false;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    clearStatus();

    const passwordValue = password.value.trim();
    const subjectValue = subject.value.trim();
    const textValue = text.value.trim();

    if (!passwordValue) {
      setMessage("パスワードを入れてください。");
      return;
    }

    if (!subjectValue) {
      setMessage("件名を入れてください。");
      return;
    }

    if (!textValue) {
      setMessage("本文を入れてください。");
      return;
    }

    try {
      setLoading(true);

      if (!confirmed) {
        setMessage("確認中...");

        const res = await fetch("/api/bulk-preview", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify({
            password: passwordValue,
            subject: subjectValue,
            text: textValue
          })
        });

        const data = await safeJson(res);

        console.log("bulk-preview status:", res.status);
        console.log("bulk-preview data:", data);

        if (!res.ok || !data?.ok) {
          setMessage(data?.message || "確認に失敗しました。");
          return;
        }

        previewBox.hidden = false;
        previewTotal.textContent = String(data.total || 0);
        previewList.textContent = Array.isArray(data.preview)
          ? data.preview.join("\n")
          : "";

        confirmed = true;
        submit.textContent = "Send";
        setMessage(`送信対象 ${data.total} 件。もう一度押すと送信します。`);
        return;
      }

      setMessage("送信中...");

      const res = await fetch("/api/bulk-send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          password: passwordValue,
          subject: subjectValue,
          text: textValue,
          confirmed: true
        })
      });

      const data = await safeJson(res);

      console.log("bulk-send status:", res.status);
      console.log("bulk-send data:", data);

      if (!res.ok || !data?.ok) {
        setMessage(data?.message || "送信に失敗しました。");
        confirmed = false;
        submit.textContent = "Confirm";
        return;
      }

      result.hidden = false;
      total.textContent = String(data.total || 0);
      success.textContent = String(data.success || 0);
      fail.textContent = String(data.fail || 0);

      setMessage("送信されました。");
      confirmed = false;
      submit.textContent = "Confirm";
    } catch (error) {
      console.error("bulk.js error:", error);
      setMessage("通信エラーが発生しました。");
      confirmed = false;
      submit.textContent = "Confirm";
    } finally {
      setLoading(false);
    }
  });

  function clearStatus() {
    message.textContent = "";
    result.hidden = true;
  }

  function setMessage(text) {
    message.textContent = text;
  }

  function setLoading(isLoading) {
    submit.disabled = isLoading;
  }

  async function safeJson(response) {
    const text = await response.text();
    if (!text) return null;

    try {
      return JSON.parse(text);
    } catch (error) {
      console.error("JSON parse error:", text);
      return null;
    }
  }
})();