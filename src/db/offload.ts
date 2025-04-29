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
    dates.push(new Date(date));
  }
  const table = new Map<Profile, boolean[]>();
  for (const date of dates) {
    const entries = await listEntries(channelId, date);
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
  const days = Array<number>(dates.length).keys().toArray().map((val) =>
    val + 1
  );
  const header = `name surname ${days.join(" ")}`;
  const text = `${
    table.entries().toArray().map(
      ([key, val]) =>
        `${key.firstName} ${key.lastName}, ${key.isFree ? "бп." : "пл."} : ${
          val.map((val) => val ? "+" : " ").join("")
        }`,
    ).join("\n")
  }`;
  return header + "\n" + text;
};
