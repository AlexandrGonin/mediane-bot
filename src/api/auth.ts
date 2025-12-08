import { getProfile } from "../db/profile.ts";
import { bot } from "../mod.ts";
import { SignJWT } from "@panva/jose";

export const auth = async (initData: string) => {
  if (!isRecent(initData)) {
    throw new Error("Auth Data is too old");
  }
  if (!await verifyInitData(initData, bot.token)) {
    throw new Error("Auth Data invalid");
  }
  const user = JSON.parse(
    new URLSearchParams(initData).get("user") || "{}",
  ) as {
    id?: number;
  };
  if (!user.id) {
    throw new Error("No user id");
  }
  const profile = await getProfile(user.id);
  if (!profile) {
    throw new Error("No profile found. Please register");
  }
  const secret = new TextEncoder().encode(bot.token);
  const access = await new SignJWT({ "id": user.id }).setIssuer("mediane")
    .setExpirationTime("3m").sign(secret);
  return access;
};

function isRecent(telegramInitData: string) {
  const urlParams: URLSearchParams = new URLSearchParams(telegramInitData);
  const auth_date = Number(urlParams.get("auth_date"));
  const isRecent = Date.now() / 1000 - auth_date < 600;
  return isRecent;
}

const verifyInitData = async (
  telegramInitData: string,
  botToken: string,
) => {
  const urlParams: URLSearchParams = new URLSearchParams(telegramInitData);

  const hash = urlParams.get("hash");
  urlParams.delete("hash");
  urlParams.sort();

  let dataCheckString = "";
  for (const [key, value] of urlParams.entries()) {
    dataCheckString += `${key}=${value}\n`;
  }
  dataCheckString = dataCheckString.slice(0, -1);

  const encoder = new TextEncoder();
  const secretKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode("WebAppData"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const botTokenKey = await crypto.subtle.sign(
    "HMAC",
    secretKey,
    encoder.encode(botToken),
  );

  const calculatedHash = await crypto.subtle.sign(
    "HMAC",
    await crypto.subtle.importKey(
      "raw",
      botTokenKey,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    ),
    encoder.encode(dataCheckString),
  );

  const calculatedHashHex = Array.from(new Uint8Array(calculatedHash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const isVerified = hash === calculatedHashHex;
  return isVerified;
};
