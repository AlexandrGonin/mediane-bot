//@ts-types="@types/express"
import express from "express";

import { webhookCallback } from "grammy";
import { bot } from "./src/mod.ts";
import { auth } from "./src/api/auth.ts";

const handleUpdate = webhookCallback(bot, "express");
const app = express();
app.use(express.json());
const port = 1337;

app.post("/bot", async (req, res) => {
  try {
    console.log("handling");
    return await handleUpdate(req, res);
  } catch (error) {
    console.log(error);
    res.status(500).send(`Internal server error: ${error}`);
  }
});

app.all("/webhook", async (req, res) => {
  try {
    await bot.api.setWebhook(`https://${req.hostname}/bot`);
    return res.status(201).send(`webhook made at https://${req.hostname}/bot`);
  } catch (error) {
    res.status(500).send(`Internal server error: ${error}`);
  }
});

app.post("/auth", async (req, res) => {
  if (!req.body.initData) {
    return res.status(400).send("No init data");
  }
  try {
    const token = await auth(req.body.initData as string);
    res.status(200).cookie("Authorization", token, { httpOnly: true });
  } catch (error) {
    res.status(400).send(error);
  }
});

app.listen(port, (err) => {
  console.log("errors:", err);
  console.log("server on port", port);
});

app.get("/", (_req, res) => res.redirect("https://t.me/constant0fps"));
