//@ts-types="@types/express"
import express from "express";

import { webhookCallback } from "grammy";
import { bot } from "./src/mod.ts";

const handleUpdate = webhookCallback(bot, "express");
const app = express();
const port = 1337;

app.post("/bot", async (req, res) => {
  try {
    return await handleUpdate(req, res);
  } catch (error) {
    res.status(500).send(`Internal server error: ${error}`);
  }
});

app.all("/webhook", async (req, res) => {
  try {
    await bot.api.setWebhook(`https://${req.hostname}/bot`);
    return res.status(201).send("webhook made");
  } catch (error) {
    res.status(500).send(`Internal server error: ${error}`);
  }
});

app.listen(port, (err) => {
  console.log("errors:", err);
  console.log("server on port", port);
});

app.get("/", (_req, res) => res.redirect("https://t.me/constant0fps"));
