// 今日热榜同源封装：静态文件优先，未命中转发 DailyHotApi
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import apiApp from "./api/dist/app.js";

const app = new Hono();

// 1. 前端静态文件（apps/hot/web/dist）
app.use("/*", serveStatic({ root: "./web/dist" }));

// 2. 其余请求交给 DailyHotApi（路由在根路径，如 /weibo）
app.use("/*", async (c) => apiApp.fetch(c.req.raw));

const port = Number(process.env.PORT || 3106);
serve({ fetch: app.fetch, port });
console.log(`hot.dailecheng.xyz local server on :${port}`);
