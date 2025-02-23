import { kv } from "../mod.ts";
import { Profile } from "./profile.ts";

export const monthAsCSV = async (channel: number) => {
  const profiles = await Array.fromAsync(
    kv.list<Profile>({ prefix: ["profile"] }),
    (e) => ({ ...e.value, id: e.key[1] as number }),
  );
  // all free profiles with array for dates of entries
  const profileEntries = profiles
    .filter((e) => e.isFree)
    .map((e) => ({
      ...e,
      entries: [] as string[],
    }));

  // get all dates for current month
  const dates = [] as string[];

  const date = new Date();
  date.setDate(1);
  const month = date.getMonth();

  while (date.getMonth() == month) {
    dates.push(date.toLocaleDateString("ru"));
    date.setDate(date.getDate() + 1);
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
    fullname: e.firstName + e.lastName,
    entries: e.entries,
  })).filter((e) => e.entries);
  return data.map((e) => `${e.fullname}: ${e.entries.join(", ")}`).join("\n");
};
