const loginForm = document.querySelector("#loginForm");
const loginNote = document.querySelector("#loginNote");

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginNote.textContent = "正在登录...";

  const formData = new FormData(loginForm);

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(Object.fromEntries(formData.entries()))
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "登录失败");
    }

    window.location.href = "admin.html";
  } catch (error) {
    loginNote.textContent = error.message;
  }
});
