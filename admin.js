(() => {
  "use strict";

  const form = document.getElementById("adminLoginForm");
  const passwordInput = document.getElementById("adminPassword");
  const message = document.getElementById("adminMessage");
  const summary = document.getElementById("adminSummary");
  const totalCount = document.getElementById("totalCount");
  const tableWrap = document.getElementById("adminTableWrap");
  const tableBody = document.getElementById("adminTableBody");
  const submitButton = form?.querySelector('button[type="submit"]');

  if (!form || !passwordInput || !message || !summary || !totalCount || !tableWrap || !tableBody || !submitButton) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const password = passwordInput.value.trim();

    clearMessage();
    hideResults();

    if (!password) {
      setMessage("password を入力してください。", "error");
      return;
    }

    setLoading(true);
    setMessage("読み込み中...", "");

    try {
      const url = `/api/entries?password=${encodeURIComponent(password)}`;
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Accept": "application/json"
        }
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.ok) {
        const errorMessage = data?.message || "一覧の取得に失敗しました。";
        setMessage(errorMessage, "error");
        return;
      }

      renderEntries(Array.isArray(data.entries) ? data.entries : []);
      totalCount.textContent = String(data.total || 0);
      summary.hidden = false;
      tableWrap.hidden = false;
      setMessage("一覧を取得しました。", "success");
    } catch (error) {
      setMessage("通信に失敗しました。", "error");
    } finally {
      setLoading(false);
    }
  });

  function renderEntries(entries) {
    tableBody.innerHTML = "";

    if (!entries.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 5;
      cell.className = "admin-empty";
      cell.textContent = "データはまだありません。";
      row.appendChild(cell);
      tableBody.appendChild(row);
      return;
    }

    entries.forEach((entry, index) => {
      const row = document.createElement("tr");

      row.appendChild(createCell(String(index + 1)));
      row.appendChild(createCell(entry?.name || ""));
      row.appendChild(createCell(entry?.email || "", "admin-cell-mail"));
      row.appendChild(createCell(formatDate(entry?.createdAt || ""), "admin-cell-time"));
      row.appendChild(createCell(entry?.ip || "", "admin-cell-ip"));

      tableBody.appendChild(row);
    });
  }

  function createCell(text, className = "") {
    const cell = document.createElement("td");
    cell.textContent = text;
    if (className) {
      cell.className = className;
    }
    return cell;
  }

  function formatDate(value) {
    if (!value) return "";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(date);
  }

  function setLoading(isLoading) {
    submitButton.disabled = isLoading;
    passwordInput.disabled = isLoading;
    submitButton.textContent = isLoading ? "Loading..." : "Load";
  }

  function setMessage(text, type = "") {
    message.textContent = text;
    message.className = "admin-message";

    if (type === "error") {
      message.classList.add("is-error");
    }

    if (type === "success") {
      message.classList.add("is-success");
    }
  }

  function clearMessage() {
    message.textContent = "";
    message.className = "admin-message";
  }

  function hideResults() {
    summary.hidden = true;
    tableWrap.hidden = true;
    tableBody.innerHTML = "";
  }
})();