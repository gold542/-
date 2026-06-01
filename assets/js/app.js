const filterButtons = document.querySelectorAll(".filter-button");
const carCards = document.querySelectorAll(".car-card");
const bookingForm = document.querySelector("#bookingForm");
const bookingResult = document.querySelector("#bookingResult");
const contactForm = document.querySelector("#contactForm");
const contactNote = document.querySelector("#contactNote");
const startDate = document.querySelector("#startDate");
const endDate = document.querySelector("#endDate");
const apiBase = window.location.protocol === "file:" ? "http://127.0.0.1:3000" : "";
const siteHeader = document.querySelector(".site-header");

const today = new Date();
const tomorrow = new Date(today);
tomorrow.setDate(today.getDate() + 1);

startDate.value = formatDate(today);
endDate.value = formatDate(tomorrow);
startDate.min = formatDate(today);
endDate.min = formatDate(tomorrow);

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const filter = button.dataset.filter;

    filterButtons.forEach((item) => item.classList.remove("is-active"));
    button.classList.add("is-active");

    carCards.forEach((card) => {
      card.hidden = filter !== "all" && card.dataset.category !== filter;
      card.classList.remove("is-visible");

      if (!card.hidden) {
        requestAnimationFrame(() => card.classList.add("is-visible"));
      }
    });
  });
});

carCards.forEach((card) => card.classList.add("is-visible"));

window.addEventListener("scroll", () => {
  siteHeader.classList.toggle("is-scrolled", window.scrollY > 18);
});

const revealItems = document.querySelectorAll(".quick-book, .fleet-section, .services, .contact, .car-card, .service-grid article");
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add("is-revealed");
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.16 });

revealItems.forEach((item) => {
  item.classList.add("reveal");
  revealObserver.observe(item);
});

bookingForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const city = document.querySelector("#city").value;
  const tripType = document.querySelector("#tripType").value;
  bookingResult.textContent = "正在向后端查询价格...";

  try {
    const quote = await postJson("/api/bookings", {
      city,
      tripType,
      startDate: startDate.value,
      endDate: endDate.value
    });

    bookingResult.textContent = `${quote.city}${quote.days}天用车，推荐「${quote.car.name}」，预估 ¥${quote.total.toLocaleString("zh-CN")} 起。订单号：${quote.orderNo}`;
  } catch (error) {
    const days = getRentalDays(startDate.value, endDate.value);
    const recommendation = getRecommendation(tripType);
    const total = days * recommendation.price;

    bookingResult.textContent = `后端暂未连接，先给你本地估价：${city}${days}天用车，推荐「${recommendation.name}」，预估 ¥${total.toLocaleString("zh-CN")} 起。`;
  }
});

contactForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(contactForm);

  contactNote.textContent = "正在提交到后端...";

  try {
    const result = await postJson("/api/contacts", Object.fromEntries(formData.entries()));

    contactNote.textContent = `${result.name}，需求已提交。编号：${result.leadNo}`;
    contactForm.reset();
  } catch (error) {
    contactNote.textContent = "后端暂未连接，请先启动 backend/server.js。";
  }
});

startDate.addEventListener("change", () => {
  const nextDay = new Date(startDate.value);
  nextDay.setDate(nextDay.getDate() + 1);
  const nextValue = formatDate(nextDay);
  endDate.min = nextValue;

  if (endDate.value <= startDate.value) {
    endDate.value = nextValue;
  }
});

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getRentalDays(start, end) {
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  return Math.max(1, Math.ceil((endTime - startTime) / dayMs));
}

function getRecommendation(type) {
  const options = {
    business: { name: "别克GL8 陆尊", price: 498 },
    family: { name: "坦克300 越野版", price: 688 },
    airport: { name: "别克GL8 陆尊", price: 498 },
    long: { name: "比亚迪汉 EV", price: 388 }
  };

  return options[type] || options.business;
}

async function postJson(path, payload) {
  const response = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "请求失败");
  }

  return data;
}
