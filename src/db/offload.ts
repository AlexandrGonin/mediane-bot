import { kv } from "../mod.ts";
import { Profile } from "./profile.ts";
import { stringify } from "jsr:@std/csv";

export const monthAsCSV = async (channel: number) => {
  const profiles = await Array.fromAsync(
    kv.list<Profile>({ prefix: ["profile"] }),
    (e) => ({ ...e.value, id: e.key[1] as number }),
  );
  const profileEntries = profiles.map((e) => ({
    ...e,
    entries: [] as string[],
  }));
  const dates = [] as string[];
  for (let i = 28; i--;) {
    const date = new Date();
    date.setDate(i + 1);
    dates.push(date.toLocaleDateString("ru"));
  }
  dates.sort();

  for (const date of dates) {
    const entries = await Array.fromAsync(
      kv.list({ prefix: ["entry", channel, date] }),
      (e) => e.key[3] as number,
    );
    for (const entry of entries) {
      const profileEntry = profileEntries.find((e) => e.id === entry);
      if (profileEntry) {
        profileEntry.entries.push(date);
      }
    }
  }
  const data = profileEntries.map((e) => ({
    name: e.firstName,
    surname: e.lastName,
    entries: e.entries.toString(),
  }));
  const csvText = stringify(data, {
    columns: ["name", "surname", "entries"],
  });
  return csvText;
};
