# 轩辕租车网站

这是一个适合直接用 HBuilder X 打开的网站项目，包含首页、快速预订、车型筛选、服务介绍、联系表单，以及一个零依赖 Node 后端。

## 打开方式

1. 在 HBuilder X 中选择“文件 -> 打开目录”。
2. 打开本文件所在的 `xuanyuan-rental` 目录。
3. 双击 `index.html`，使用内置浏览器或外部浏览器预览。

## 启动后端

进入项目目录后运行：

```bash
node backend/server.js
```

启动成功后访问：

- 网站页面：`http://127.0.0.1:3000`
- 健康检查：`http://127.0.0.1:3000/api/health`
- 车辆接口：`http://127.0.0.1:3000/api/cars`

如果直接用 HBuilder X 打开 `index.html`，前端会自动请求 `http://127.0.0.1:3000` 的后端接口。

## 项目结构

```text
xuanyuan-rental/
  index.html
  assets/
    css/
      styles.css
    js/
      app.js
  backend/
    server.js
    data/
      bookings.json
      contacts.json
  package.json
  README.md
```

## 可继续扩展

- 接入真实车辆库存接口。
- 将联系表单提交到后端或企业微信机器人。
- 增加城市门店页、订单确认页和会员登录。
