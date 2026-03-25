(() => {
  const form = document.getElementById("bulkForm");
  const message = document.getElementById("bulkMessage");
  const result = document.getElementById("bulkResult");

  const total = document.getElementById("bulkTotal");
  const success = document.getElementById("bulkSuccess");
  const fail = document.getElementById("bulkFail");

  const password = document.getElementById("bulkPassword");
  const subject = document.getElementById("bulkSubject");
  const text = document.getElementById("bulkText");

  let confirmed = false;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!confirmed) {
      // プレビュー
      const res = await fetch("/api/bulk-preview", {
        method: "POST",
        body: JSON.stringify({
          password: password.value
        })
      });

      const data = await res.json();

      if (!data.ok) {
        message.textContent = data.message;
        return;
      }

      message.textContent =
        `送信対象 ${data.total} 件\n本当に送るならもう一度押す`;

      confirmed = true;
      return;
    }

    // 送信
    const res = await fetch("/api/bulk-send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password: password.value,
        subject: subject.value,
        text: text.value,
        confirmed: true
      })
    });

    const data = await res.json();

    if (!data.ok) {
      message.textContent = data.message;
      return;
    }

    result.hidden = false;
    total.textContent = data.total;
    success.textContent = data.success;
    fail.textContent = data.fail;

    message.textContent = "送信完了";
  });
})();