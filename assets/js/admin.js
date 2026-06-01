const statusText = document.querySelector("#adminStatus");
const bookingRows = document.querySelector("#bookingRows");
const contactRows = document.querySelector("#contactRows");
const bookingCount = document.querySelector("#bookingCount");
const contactCount = document.querySelector("#contactCount");
const totalAmount = document.querySelector("#totalAmount");
const refreshButton = document.querySelector("#refreshButton");
const logoutButton = document.querySelector("#logoutButton");

refreshButton.addEventListener("click", loadAdminData);
logoutButton.addEventListener("click", logout);
loadAdminData();

async function loadAdminData() {
  statusText.textContent = "正在读取后端数据...";

  try {
    const [bookingData, contactData] = await Promise.all([
      getJson("/api/bookings"),
      getJson("/api/contacts")
    ]);

    const bookings = bookingData.bookings || [];
    const contacts = contactData.contacts || [];

    renderBookings(bookings);
    renderContacts(contacts);
    renderStats(bookings, contacts);
    statusText.textContent = `最近刷新：${new Date().toLocaleString("zh-CN")}`;
  } catch (error) {
    if (error.status === 401) {
      window.location.href = "login.html";
      return;
    }

    statusText.textContent = "读取失败，请确认后端服务已经启动。";
  }
}

function renderBookings(bookings) {
  bookingRows.innerHTML = "";

  if (bookings.length === 0) {
    bookingRows.appendChild(createEmptyRow(8, "暂无预约记录"));
    return;
  }

  bookings.slice().reverse().forEach((booking) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(booking.orderNo)}</td>
      <td>${escapeHtml(booking.city)}</td>
      <td>${escapeHtml(booking.car?.name || "-")}</td>
      <td>${escapeHtml(booking.startDate)}</td>
      <td>${escapeHtml(booking.endDate)}</td>
      <td>${booking.days}</td>
      <td>¥${Number(booking.total || 0).toLocaleString("zh-CN")}</td>
      <td>${formatTime(booking.createdAt)}</td>
    `;
    bookingRows.appendChild(row);
  });
}

function renderContacts(contacts) {
  contactRows.innerHTML = "";

  if (contacts.length === 0) {
    contactRows.appendChild(createEmptyRow(5, "暂无联系需求"));
    return;
  }

  contacts.slice().reverse().forEach((contact) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(contact.leadNo)}</td>
      <td>${escapeHtml(contact.name)}</td>
      <td>${escapeHtml(contact.phone)}</td>
      <td>${escapeHtml(contact.message || "-")}</td>
      <td>${formatTime(contact.createdAt)}</td>
    `;
    contactRows.appendChild(row);
  });
}

function renderStats(bookings, contacts) {
  const total = bookings.reduce((sum, booking) => sum + Number(booking.total || 0), 0);

  bookingCount.textContent = bookings.length;
  contactCount.textContent = contacts.length;
  totalAmount.textContent = `¥${total.toLocaleString("zh-CN")}`;
}

async function getJson(path) {
  const response = await fetch(path);
  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.message || "请求失败");
    error.status = response.status;
    throw error;
  }

  return data;
}

async function logout() {
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "login.html";
}

function createEmptyRow(colspan, text) {
  const row = document.createElement("tr");
  const cell = document.createElement("td");

  cell.colSpan = colspan;
  cell.className = "empty-cell";
  cell.textContent = text;
  row.appendChild(cell);

  return row;
}

function formatTime(value) {
  if (!value) {
    return "-";
  }

  return new Date(value).toLocaleString("zh-CN");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
