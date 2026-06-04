const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(__dirname, "data");
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || readAdminPasswordHash();
const SESSION_MS = 24 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const sessions = new Map();
const loginAttempts = new Map();

const cars = [
  {
    id: "business-01",
    category: "business",
    name: "别克GL8 陆尊",
    tag: "商务优选",
    seats: 7,
    price: 498
  },
  {
    id: "business-02",
    category: "business",
    name: "奥迪A6L",
    tag: "轻奢轿车",
    seats: 5,
    price: 588
  },
  {
    id: "suv-01",
    category: "suv",
    name: "坦克300 越野版",
    tag: "硬派越野",
    seats: 5,
    price: 688
  },
  {
    id: "ev-01",
    category: "ev",
    name: "比亚迪汉 EV",
    tag: "新能源",
    seats: 5,
    price: 388
  },
  {
    id: "economy-01",
    category: "economy",
    name: "大众朗逸",
    tag: "经济实用",
    seats: 5,
    price: 238
  }
];

const recommendationMap = {
  business: "business-01",
  luxury: "business-02",
  family: "suv-01",
  airport: "business-01",
  long: "ev-01"
};

const allowedCities = new Set(["呼和浩特"]);
const allowedTripTypes = new Set(Object.keys(recommendationMap));

const server = http.createServer(async (req, res) => {
  setSecurityHeaders(res);
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    return sendJson(res, 204, {});
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (url.pathname === "/api/health" && req.method === "GET") {
      return sendJson(res, 200, { ok: true, service: "xuanyuan-rental-backend" });
    }

    if (url.pathname === "/api/cars" && req.method === "GET") {
      return sendJson(res, 200, { cars });
    }

    if (url.pathname === "/api/login" && req.method === "POST") {
      return handleLogin(req, res);
    }

    if (url.pathname === "/api/logout" && req.method === "POST") {
      return handleLogout(req, res);
    }

    if (url.pathname === "/api/me" && req.method === "GET") {
      return sendJson(res, 200, { loggedIn: isLoggedIn(req), user: isLoggedIn(req) ? ADMIN_USER : null });
    }

    if (url.pathname === "/api/bookings" && req.method === "GET") {
      if (!isLoggedIn(req)) {
        return sendJson(res, 401, { message: "请先登录后台" });
      }

      return sendJson(res, 200, { bookings: readRecords("bookings.json") });
    }

    if (url.pathname === "/api/bookings" && req.method === "POST") {
      return handleBooking(req, res);
    }

    if (url.pathname === "/api/contacts" && req.method === "GET") {
      if (!isLoggedIn(req)) {
        return sendJson(res, 401, { message: "请先登录后台" });
      }

      return sendJson(res, 200, { contacts: readRecords("contacts.json") });
    }

    if (url.pathname === "/api/contacts" && req.method === "POST") {
      return handleContact(req, res);
    }

    if (req.method === "GET" || req.method === "HEAD") {
      return serveStatic(url.pathname, req, res);
    }

    return sendJson(res, 405, { message: "请求方法不支持" });
  } catch (error) {
    return sendJson(res, 500, { message: "服务器内部错误", detail: error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`轩辕租车后端已启动：http://${HOST}:${PORT}`);
});

async function handleBooking(req, res) {
  const body = await readJson(req);
  const booking = {
    city: cleanText(body.city, 20),
    tripType: cleanText(body.tripType, 24),
    startDate: cleanText(body.startDate, 10),
    endDate: cleanText(body.endDate, 10)
  };
  const required = ["city", "tripType", "startDate", "endDate"];
  const missing = required.filter((key) => !booking[key]);

  if (missing.length > 0) {
    return sendJson(res, 400, { message: `缺少字段：${missing.join(", ")}` });
  }

  if (!allowedCities.has(booking.city)) {
    return sendJson(res, 400, { message: "暂不支持该取车城市" });
  }

  if (!allowedTripTypes.has(booking.tripType)) {
    return sendJson(res, 400, { message: "用车类型不正确" });
  }

  if (!isDateOnly(booking.startDate) || !isDateOnly(booking.endDate)) {
    return sendJson(res, 400, { message: "日期格式不正确" });
  }

  const days = getRentalDays(booking.startDate, booking.endDate);

  if (!Number.isFinite(days) || days < 1) {
    return sendJson(res, 400, { message: "还车日期必须晚于取车日期" });
  }

  const carId = recommendationMap[booking.tripType] || recommendationMap.business;
  const car = cars.find((item) => item.id === carId);
  const order = {
    orderNo: createNo("XY"),
    city: booking.city,
    tripType: booking.tripType,
    startDate: booking.startDate,
    endDate: booking.endDate,
    days,
    car,
    total: days * car.price,
    createdAt: new Date().toISOString()
  };

  appendRecord("bookings.json", order);

  return sendJson(res, 201, order);
}

async function handleContact(req, res) {
  const body = await readJson(req);
  const leadName = cleanText(body.name, 32);
  const leadPhone = cleanText(body.phone, 24);

  if (!leadName || !leadPhone) {
    return sendJson(res, 400, { message: "姓名和手机不能为空" });
  }

  if (!/^[0-9+\-\s]{6,24}$/.test(leadPhone)) {
    return sendJson(res, 400, { message: "手机号码格式不正确" });
  }

  const lead = {
    leadNo: createNo("LD"),
    name: leadName,
    phone: leadPhone,
    message: cleanText(body.message, 200),
    createdAt: new Date().toISOString()
  };

  appendRecord("contacts.json", lead);

  return sendJson(res, 201, lead);
}

async function handleLogin(req, res) {
  const body = await readJson(req);

  if (isLoginLimited(req)) {
    return sendJson(res, 429, { message: "登录尝试过多，请稍后再试" });
  }

  if (cleanText(body.username, 40) !== ADMIN_USER || !verifyPassword(body.password)) {
    recordLoginFailure(req);
    return sendJson(res, 401, { message: "账号或密码错误" });
  }

  clearLoginFailures(req);
  const token = createSessionToken();
  sessions.set(token, { user: ADMIN_USER, expiresAt: Date.now() + SESSION_MS });
  res.setHeader("Set-Cookie", `xy_admin=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`);

  return sendJson(res, 200, { ok: true, user: ADMIN_USER });
}

function handleLogout(req, res) {
  const token = getCookie(req, "xy_admin");

  if (token) {
    sessions.delete(token);
  }

  res.setHeader("Set-Cookie", "xy_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
  return sendJson(res, 200, { ok: true });
}

function serveStatic(requestPath, req, res) {
  const cleanPath = decodeURIComponent(requestPath === "/" ? "/index.html" : requestPath);

  if (isBlockedStaticPath(cleanPath)) {
    return sendJson(res, 403, { message: "禁止访问" });
  }

  if (cleanPath === "/admin.html" && !isLoggedIn(req)) {
    res.writeHead(302, { Location: "/login.html" });
    return res.end();
  }

  const filePath = path.resolve(ROOT_DIR, `.${cleanPath}`);

  if (filePath !== ROOT_DIR && !filePath.startsWith(`${ROOT_DIR}${path.sep}`)) {
    return sendJson(res, 403, { message: "禁止访问" });
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return sendJson(res, 404, { message: "资源不存在" });
  }

  res.writeHead(200, {
    "Content-Type": getContentType(filePath)
  });

  if (req.method === "HEAD") {
    return res.end();
  }

  return fs.createReadStream(filePath).pipe(res);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;

      if (body.length > 64 * 1024) {
        req.destroy();
        reject(new Error("请求体过大"));
      }
    });

    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error("JSON 格式错误"));
      }
    });

    req.on("error", reject);
  });
}

function appendRecord(fileName, record) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const filePath = path.join(DATA_DIR, fileName);
  const records = readRecords(fileName);

  records.push(record);
  fs.writeFileSync(filePath, `${JSON.stringify(records, null, 2)}\n`, "utf8");
}

function readRecords(fileName) {
  const filePath = path.join(DATA_DIR, fileName);

  if (!fs.existsSync(filePath)) {
    return [];
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8") || "[]");
}

function readAdminPasswordHash() {
  const filePath = path.join(DATA_DIR, "admin-password.json");

  if (!fs.existsSync(filePath)) {
    return "";
  }

  const configText = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const config = JSON.parse(configText || "{}");

  return typeof config.passwordHash === "string" ? config.passwordHash : "";
}

function isLoggedIn(req) {
  const token = getCookie(req, "xy_admin");
  const session = token ? sessions.get(token) : null;

  if (!session) {
    return false;
  }

  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return false;
  }

  return true;
}

function getCookie(req, name) {
  const cookie = req.headers.cookie || "";
  const parts = cookie.split(";").map((item) => item.trim());
  const match = parts.find((item) => item.startsWith(`${name}=`));

  return match ? decodeURIComponent(match.slice(name.length + 1)) : "";
}

function getRentalDays(start, end) {
  const startTime = new Date(`${start}T00:00:00`).getTime();
  const endTime = new Date(`${end}T00:00:00`).getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  return Math.ceil((endTime - startTime) / dayMs);
}

function createNo(prefix) {
  const time = Date.now().toString(36).toUpperCase();
  const suffix = crypto.randomBytes(3).toString("hex").toUpperCase();

  return `${prefix}${time}${suffix}`;
}

function createSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

function verifyPassword(password) {
  const hash = crypto.createHash("sha256").update(String(password || "")).digest("hex");
  const input = Buffer.from(hash, "hex");
  const expected = Buffer.from(ADMIN_PASSWORD_HASH, "hex");

  return input.length === expected.length && crypto.timingSafeEqual(input, expected);
}

function getClientKey(req) {
  return req.socket.remoteAddress || "local";
}

function isLoginLimited(req) {
  const record = loginAttempts.get(getClientKey(req));

  return Boolean(record && record.count >= LOGIN_MAX_ATTEMPTS && record.resetAt > Date.now());
}

function recordLoginFailure(req) {
  const key = getClientKey(req);
  const now = Date.now();
  const current = loginAttempts.get(key);
  const record = current && current.resetAt > now
    ? current
    : { count: 0, resetAt: now + LOGIN_WINDOW_MS };

  record.count += 1;
  loginAttempts.set(key, record);
}

function clearLoginFailures(req) {
  loginAttempts.delete(getClientKey(req));
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, maxLength);
}

function isDateOnly(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isBlockedStaticPath(cleanPath) {
  const normalized = cleanPath.replace(/\\/g, "/").toLowerCase();

  return normalized.startsWith("/backend/")
    || normalized.startsWith("/.git")
    || normalized.endsWith(".env")
    || normalized.includes("/.");
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(statusCode === 204 ? "" : JSON.stringify(payload));
}

function setSecurityHeaders(res) {
  res.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self' http://127.0.0.1:3000 http://localhost:3000; form-action 'self'; frame-ancestors 'none'; base-uri 'self'");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
}

function setCorsHeaders(req, res) {
  const allowedOrigins = new Set(["http://127.0.0.1:3000", "http://localhost:3000", "null"]);
  const origin = req.headers.origin;

  if (allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml"
  };

  return types[ext] || "application/octet-stream";
}
