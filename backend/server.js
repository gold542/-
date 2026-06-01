const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(__dirname, "data");
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "123456";
const sessions = new Set();

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
  family: "suv-01",
  airport: "business-01",
  long: "ev-01"
};

const server = http.createServer(async (req, res) => {
  setCorsHeaders(res);

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
  const required = ["city", "tripType", "startDate", "endDate"];
  const missing = required.filter((key) => !body[key]);

  if (missing.length > 0) {
    return sendJson(res, 400, { message: `缺少字段：${missing.join(", ")}` });
  }

  const days = getRentalDays(body.startDate, body.endDate);

  if (!Number.isFinite(days) || days < 1) {
    return sendJson(res, 400, { message: "还车日期必须晚于取车日期" });
  }

  const carId = recommendationMap[body.tripType] || recommendationMap.business;
  const car = cars.find((item) => item.id === carId);
  const order = {
    orderNo: createNo("XY"),
    city: body.city,
    tripType: body.tripType,
    startDate: body.startDate,
    endDate: body.endDate,
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

  if (!body.name || !body.phone) {
    return sendJson(res, 400, { message: "姓名和手机不能为空" });
  }

  const lead = {
    leadNo: createNo("LD"),
    name: String(body.name).trim(),
    phone: String(body.phone).trim(),
    message: String(body.message || "").trim(),
    createdAt: new Date().toISOString()
  };

  appendRecord("contacts.json", lead);

  return sendJson(res, 201, lead);
}

async function handleLogin(req, res) {
  const body = await readJson(req);

  if (body.username !== ADMIN_USER || body.password !== ADMIN_PASSWORD) {
    return sendJson(res, 401, { message: "账号或密码错误" });
  }

  const token = createNo("SS");
  sessions.add(token);
  res.setHeader("Set-Cookie", `xy_admin=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`);

  return sendJson(res, 200, { ok: true, user: ADMIN_USER });
}

function handleLogout(req, res) {
  const token = getCookie(req, "xy_admin");

  if (token) {
    sessions.delete(token);
  }

  res.setHeader("Set-Cookie", "xy_admin=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
  return sendJson(res, 200, { ok: true });
}

function serveStatic(requestPath, req, res) {
  const cleanPath = decodeURIComponent(requestPath === "/" ? "/index.html" : requestPath);

  if (cleanPath === "/admin.html" && !isLoggedIn(req)) {
    res.writeHead(302, { Location: "/login.html" });
    return res.end();
  }

  const filePath = path.resolve(ROOT_DIR, `.${cleanPath}`);

  if (!filePath.startsWith(ROOT_DIR)) {
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

      if (body.length > 1024 * 1024) {
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

function isLoggedIn(req) {
  const token = getCookie(req, "xy_admin");

  return Boolean(token && sessions.has(token));
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
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();

  return `${prefix}${time}${suffix}`;
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(statusCode === 204 ? "" : JSON.stringify(payload));
}

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
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
