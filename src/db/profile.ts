import { kv } from "../mod.ts";

export interface Profile {
  firstName: string;
  lastName: string;
  isFree: boolean;
}

const profileKey = (id: number) => ["profile", id];

export const getProfile = async (id: number) =>
  (await kv.get<Profile>(profileKey(id))).value;

export const setProfile = async (
  id: number,
  firstName: string,
  lastName: string,
  isFree: boolean,
) =>
  await kv.set(
    profileKey(id),
    { firstName, lastName, isFree } as Profile,
  );

export const removeProfile = async (id: number) =>
  await kv.delete(profileKey(id));

export const sorting = (profile1: Profile, profile2: Profile) => {
  return (profile1.lastName != profile2.lastName)
    ? profile1.lastName.localeCompare(profile2.lastName)
    : profile1.firstName.localeCompare(profile2.firstName);
};
