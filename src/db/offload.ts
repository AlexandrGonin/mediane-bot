import { kv } from "../mod.ts";
import { Profile } from "./profile.ts";

export const monthAsText = async (channel: number) => {
  const profiles = await Array.fromAsync(
    kv.list<Profile>({ prefix: ["profile"] }),
    (e) => ({ ...e.value, id: e.key[1] as number }),
  );
  // all free profiles with array for dates of entries
  const profileEntries = profiles
    .map((e) => ({
      ...e,
      entries: [] as string[],
    }));

  // get all dates for current month
  const dates: string[] = [];

  const date = new Date();
  date.setDate(1);
  const month = date.getMonth();
  for (
    const date = new Date();
    date.getMonth() == month;
    date.setDate(date.getDate() + 1)
  ) {
    dates.push(date.toLocaleDateString("ru"));
  }
  // push dates of entries to respective profiles
  for (const date of dates) {
    const entryIds = await Array.fromAsync(
      kv.list({ prefix: ["entry", channel, date] }),
      (e) => e.key[3] as number, // ids for each entry on date
    );
    for (const entryId of entryIds) {
      const profileEntry = profileEntries.find((profile) =>
        profile.id === entryId
      );
      profileEntry?.entries.push(date);
    }
  }
  // gather data for plain text
  const data = profileEntries.map((e) => ({
    ...e,
    entries: e.entries.map((date) => date.split(".")[0]),
  })).filter((e) => e.entries.length);
  return data.map((e) => `${e.name} ${e.surname}: ${e.entries.join(", ")}`)
    .join("\n");
};

export const profilesToIds = async () => {
  const profiles = await Array.fromAsync(
    kv.list<Profile>({ prefix: ["profile"] }),
    (e) => ({
      ...e.value,
      id: e.key[1],
    }),
  );
  return profiles.map((e) => `${e.name} ${e.surname}'s id: ${e.id.toString()}`)
    .join("\n");
};
