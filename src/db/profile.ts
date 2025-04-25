import { kv } from "../mod.ts";

export interface Profile {
  name: string;
  surname: string;
  isFree: boolean;
}

const profileKey = (id: number) => ["profile", id];

export const getProfile = async (id: number) =>
  (await kv.get<Profile>(profileKey(id))).value;

export const setProfile = async (
  id: number,
  name: string,
  surname: string,
  isFree: boolean,
) =>
  await kv.set(
    profileKey(id),
    { name, surname, isFree } as Profile,
  );

export const sorting = (profile1: Profile, profile2: Profile) => {
  if (profile1.surname != profile2.surname) {
    return profile1.surname.localeCompare(profile2.surname);
  }
  return profile1.name.localeCompare(profile2.name);
};
