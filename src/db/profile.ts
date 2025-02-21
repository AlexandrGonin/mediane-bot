import { kv } from "../mod.ts";

interface Profile {
  firstName: string;
  lastName: string;
  isFree: boolean;
}

const profileKey = (id: number) => ["profile", id];

export const getProfile = async (id: number) =>
  (await kv.get<Profile>(profileKey(id))).value;

export const setProfile = async (
  id: number,
  name: string,
  surname: string,
  free: boolean,
) =>
  await kv.set(
    profileKey(id),
    { firstName: name, lastName: surname, isFree: free } as Profile,
  );
