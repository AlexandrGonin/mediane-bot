# mediane-bot

A Telegram bot that runs a daily canteen sign-up sheet and a rotating duty
roster for a small organisation.

Every morning it publishes a post in one or more channels. The post carries a
button that deep-links into the bot, where registered people sign themselves up
or drop out. The post in the channel rewrites itself as the list changes, and
closes automatically after a fixed window. A second message names the group on
duty that day, taken from a rotation the owner maintains.

Built on [grammY](https://grammy.dev) and Deno KV, with no external database.

---

## Contents

- [How it works](#how-it-works)
- [Commands](#commands)
- [The duty rotation](#the-duty-rotation)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [First-run setup](#first-run-setup)
- [Architecture](#architecture)
- [Data model](#data-model)
- [Security model](#security-model)
- [Development](#development)
- [Known limitations](#known-limitations)

---

## How it works

**07:15 local time, Monday to Saturday** (02:15 UTC, see
[Scheduled jobs](#scheduled-jobs)):

1. For each allowed channel the bot posts a placeholder, records it in KV with
   a close time three hours out, then rewrites it into the sign-up post with an
   inline button.
2. It posts the duty group for the day and advances the rotation by one.

**While sign-up is open**, a person opens the button, lands in a private chat
with the bot and toggles their attendance. Each toggle rewrites the channel
post, which always shows the current list split into free and paying, sorted by
surname, with a count in the footer.

**Three hours later** a maintenance job closes the post: the button becomes a
lock, the finished list is forwarded to the owner, and the post is marked
closed. It stays under the bot's control, so a later ban or profile removal
still corrects the published text. Three days on, the record and its sign-ups
are deleted.

---

## Commands

### Anyone

| Command | Effect |
| --- | --- |
| `/register` | Create a profile: given name, surname, free/paying. Required before signing up. |
| `/start <postId>` | Opened by the channel button. Shows attendance for that post with a toggle. |
| `/cancel` | Clear the current dialogue state. |

A person can only ever change their own profile and their own attendance.

### Owner only

Gated on `OWNER_ID`; the bot does not respond to anyone else.

| Command | Effect |
| --- | --- |
| `/current` | Who is on duty under the next post, with their position in the rotation. |
| `/roll [n]` | Advance the rotation by `n` live groups (default 1). |
| `/rollback [n]` | Move the rotation back by `n` live groups (default 1). |
| `/schedule` | Interactive editor for duty groups. |
| `/ban <surname>` | Block a person by Telegram id and drop them from open sign-ups. |
| `/unban <surname>` | Lift a block. |
| `/banlist` | List blocked people with the date they were blocked. |
| `/remove <surname>` | Delete a profile and its sign-ups. |
| `/rename <surname> <new name> <new surname>` | Rename a profile. |
| `/add <channelId>` | Allow a channel (negative id). |
| `/close <postId>` | Close a sign-up early. |
| `/open`, `/stop` | Enable or disable the morning post. Enabled by default. |
| `/cron` | Publish immediately, exactly as the morning job does. Advances the rotation. |

Surname lookup is case-insensitive and never interpreted as an id, so a
surname consisting of digits still resolves. When several people share a
surname the bot offers a choice of buttons.

### In an allowed channel

Posted as a channel message, not sent to the bot. Requires the bot to be a
channel admin with permission to post and edit messages.

| Command | Effect |
| --- | --- |
| `/post [title]` | Turn the message into a sign-up post. Title defaults to today's date. |
| `/duty` | Rewrite the message with the current duty group. Read-only. |

---

## The duty rotation

Groups are stored as an ordered list; a pointer marks whose turn is next.

The rotation runs over **live groups only**. A group counts as live when at
least one of its members still has a profile. Empty groups, and groups whose
members were all removed or banned, drop out of the cycle completely — they are
skipped by the daily step, by `/roll` and `/rollback`, and when wrapping past
either end of the list. Nothing needs to be tidied up by hand.

```
groups:  [A]  []  [B]  [C]  []          <- as stored
live:     A        B    C               <- what the rotation sees

pointer on C, /roll 1   -> A            (wraps past the trailing empty group)
pointer on A, /rollback 1 -> C
pointer on A, /rollback 11 -> C         (11 mod 3 = 2 steps back)
```

If the pointer ends up on a group that has died, the next live group takes
over. `/roll 0` is a no-op that still reports the current state.

Groups are edited with `/schedule`. In the editor each row is a group: tap two
people to swap them, tap `➕ в группу N` and then a person to move them, `⬆️ ряд`
inserts a row above, `🗑` deletes an empty row. `Сохранить` writes the result.

---

## Configuration

All configuration is environment variables. Nothing that grants authority is
stored in the database.

| Variable | Required | Purpose |
| --- | --- | --- |
| `TOKEN` | yes | Bot token from [@BotFather](https://t.me/BotFather). |
| `OWNER_ID` | yes | Numeric Telegram id of the single owner. Get it from [@userinfobot](https://t.me/userinfobot). |
| `WEBHOOK_SECRET` | webhook only | Shared secret with Telegram. `[A-Za-z0-9_-]`, 1–256 characters. |

Without `OWNER_ID` every owner command is disabled. Without `WEBHOOK_SECRET`
the webhook endpoint rejects everything with 403 — deliberately, so there is no
unauthenticated window.

Generate a secret with:

```bash
head -c 36 /dev/urandom | base64 | tr '+/' '-_' | tr -d '='
```

---

## Deployment

Two entry points:

- `dev.ts` — long polling. No public URL needed. Best for a VPS.
- `deploy.ts` — webhook over HTTP. Used on Deno Deploy.

Only one may be active at a time: a registered webhook makes long polling fail
with a 409 conflict.

### Deno Deploy

1. Point a Deploy project at this repository, entry point `deploy.ts`.
2. Set `TOKEN`, `OWNER_ID` and `WEBHOOK_SECRET` in the project's environment.
3. Deploy, then confirm that **Register crons** lists `daily entry` and
   `close posts`.
4. Register the webhook once by opening, in a browser:

   ```
   https://<project>.deno.dev/webhook?key=<WEBHOOK_SECRET>
   ```

   A `Done. Set` response means Telegram now signs every update with the
   secret. Repeat this whenever the secret changes.

Deno Deploy's KV runs over KV Connect, which has no queue support, so post
closing is driven by a cron rather than `kv.enqueue`.

### VPS

```bash
curl -fsSL https://deno.land/install.sh | sh
git clone https://github.com/AlexandrGonin/mediane-bot && cd mediane-bot
printf 'TOKEN=...\nOWNER_ID=...\n' > .env
deno run -A --unstable-kv --unstable-cron dev.ts
```

If a webhook was registered earlier, clear it first:

```bash
curl -s "https://api.telegram.org/bot<TOKEN>/deleteWebhook?drop_pending_updates=true"
```

As a service, `/etc/systemd/system/mediane-bot.service`:

```ini
[Unit]
Description=mediane-bot
After=network-online.target

[Service]
Type=simple
User=bot
WorkingDirectory=/home/bot/mediane-bot
Environment=TZ=UTC
ExecStart=/home/bot/.deno/bin/deno run -A --unstable-kv --unstable-cron dev.ts
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

`WorkingDirectory` must be the project root: `deno.json` supplies the import
map and the unstable flags, and `.env` is read relative to it.

Resource use is modest — roughly 150–200 MB of RSS and near-zero CPU at rest.
1 GB and one core is comfortable. The one spike is the first run, which
downloads and type-checks the dependency graph; on a small instance add swap or
warm the cache with `deno cache dev.ts` beforehand.

### Scheduled jobs

| Job | Schedule (UTC) | Purpose |
| --- | --- | --- |
| `daily entry` | `15 2 * * 1-6` | Publish the sign-up post and duty list. |
| `close posts` | `*/5 * * * *` | Close due posts, purge posts older than three days. |

Cron runs in UTC on both targets, while dates in the post are formatted for
`Asia/Yekaterinburg` — 02:15 UTC is 07:15 there. Numeric weekdays are required:
Deno Deploy rejects `MON-SAT`.

---

## First-run setup

1. Add the bot to the channel as an administrator with **post messages** and
   **edit messages**.
2. Find the channel id (negative, usually `-100…`) and send the bot
   `/add -100xxxxxxxxxx`.
3. Register the people who will use it (`/register`), then build the rotation
   with `/schedule`.
4. Check it with `/current`, and publish a trial run with `/cron`.

Posting is on by default; `/open` is only needed after a `/stop`.

---

## Architecture

```
deploy.ts / dev.ts        entry points: webhook or long polling
└── src/mod.ts            bot instance, middleware, cron jobs, closePost
    ├── owner.ts          OWNER_ID and the isOwner predicate
    ├── composers/
    │   ├── channel.ts    channel commands, post rendering, refreshPosts
    │   ├── entry.ts      deep link and the sign-up toggle
    │   ├── registry.ts   /register dialogue
    │   └── admin/
    │       ├── util.ts   owner commands
    │       └── keyboard.ts  /schedule editor
    └── db/               thin typed wrappers over Deno KV
        ├── post.ts       posts, isClosed
        ├── entry.ts      sign-ups, id validation
        ├── profile.ts    profiles, bans, name cleaning
        ├── duty.ts       rotation
        └── channel.ts    allowed channels
```

Two middleware run ahead of everything else, in order:

1. **Ban filter.** Anyone blocked gets a single reply and goes no further, so a
   block cannot be worked around by re-registering or renaming.
2. **Post refresh.** After each update every known post is re-rendered. Each
   post stores the text it last showed, so an unchanged post costs no Telegram
   request, and profiles are loaded once per pass rather than once per person.

`src/owner.ts` deliberately imports nothing: `mod.ts` and the composers all
read it, and an import there would close a cycle that fails at startup.

---

## Data model

All state lives in Deno KV.

| Key | Value | Notes |
| --- | --- | --- |
| `["profile", userId]` | `{ firstName, lastName, isFree }` | Created by `/register`. |
| `["entry", postId, userId]` | `true` | One per sign-up. |
| `["post", postId]` | `{ name, channel_id, message_id, date, closeAt, closed?, lastText? }` | `postId` is a nanoid. |
| `["group", n]` | `{ members: number[] }` | Duty groups in order. |
| `["order"]` | `number` | Index of the group up next. |
| `["ban", userId]` | `{ firstName, lastName, at }` | Name is a snapshot; it survives profile deletion. |
| `["channel", channelId]` | `boolean` | Allowed channels. |
| `["open"]` | `boolean` | Only `false` disables posting; absent means enabled. |

Sign-up is closed by time, not by a flag:

```ts
isClosed(post) = post.closed === true || !(post.closeAt > Date.now())
```

`closeAt` is written in the same operation that creates the post, and a missing
or malformed value reads as closed. A cron that runs late, or not at all, can
therefore never leave a post accepting sign-ups.

---

## Security model

- **One owner, from the environment.** `OWNER_ID` is the only source of
  authority. No command, button or database row can grant it.
- **Webhook authentication.** `deploy.ts` verifies
  `x-telegram-bot-api-secret-token` against `WEBHOOK_SECRET` before handing an
  update to grammY, and the webhook registration route is behind the same
  secret. Without it, anyone who guessed the URL could forge an update
  claiming to be the owner.
- **Untrusted input is validated at the boundary.** Post ids must match the
  nanoid shape, user ids must be positive safe integers, channel ids must be
  negative, and keyboard indices are bounds-checked against the session state.
- **Names are escaped and bounded.** Posts are sent as HTML, so `&`, `<` and
  `>` are escaped and names are capped at 32 characters; the rendered post is
  truncated at 3900. An unescaped ampersand used to break a post permanently.
- **Bans are by Telegram id** and are enforced before any handler runs.

Channel `/post` and `/duty` are the one exception: they are authorised by the
channel allowlist, not by `OWNER_ID`, because Telegram channel posts carry no
`from` field to check. Anyone you make an administrator of an allowed channel
can use them.

---

## Development

```bash
deno task start   # long polling with --watch
deno task check   # type-check both entry points
deno task fmt
deno task lint
```

Commit `deno.lock` after the first run. Dependencies are currently pinned only
by the lockfile; without it a later release of grammY can change behaviour
between deploys.

---

## Known limitations

- **A blocked person can return on a second Telegram account.** Bans key on
  the account, and the bot has no other identity to go on.
- **No atomic KV transactions.** Concurrent toggles can interleave; the effects
  are cosmetic and settle on the next refresh.
- **Anyone can make the bot work.** The refresh pass runs on every update, so
  a determined spammer costs KV reads. There is no rate limiting.
- **`/duty` and `/post` are available to channel administrators**, per the note
  in [Security model](#security-model).
- **`/cron` advances the rotation** exactly as the real job does. Undo with
  `/rollback 1`.

---

Original implementation courtesy of [@mckoda09](https://github.com/mckoda09).
