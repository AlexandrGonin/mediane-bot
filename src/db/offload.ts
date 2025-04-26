import { listEntries } from "./entry.ts";
import { Profile } from "./profile.ts";

export const monthAsText = async (channelId: number, month: number) => {
  if (month <= 0 || month > 12) return "";
  // dates of the month
  const dates: Date[] = [];
  for (
    const date = new Date((new Date()).getFullYear(), month, 1);
    date.getMonth() == month;
    date.setDate(date.getDate() + 1)
  ) {
    console.log(date.toLocaleDateString("ru"));
    dates.push(new Date(date));
  }
  console.log(dates.map((val) => val.toLocaleDateString("ru")));
  const table = new Map<Profile, boolean[]>();
  for (const date of dates) {
    const entries = await listEntries(channelId, date);
    console.log(date, entries);
    for (const profile of entries) {
      table.set(
        profile,
        (table.get(profile) || Array<boolean>(dates.length)).with(
          date.getDate() - 1,
          true,
        ),
      );
    }
  }
  console.log(table);
  const days = Array<number>(dates.length).keys().toArray().map((val) =>
    val + 1
  );
  const header = `name surname ${days.join(" ")}`;
  const text = `${
    table.entries().toArray().map(
      ([key, val]) =>
        `${key.name} ${key.surname}, ${key.isFree ? "бп." : "пл."} : ${
          val.map((val) => val ? "+" : " ").join("")
        }`,
    ).join("\n")
  }`;
  return header + "\n" + text;
};
