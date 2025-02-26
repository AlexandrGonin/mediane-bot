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
  name: string,
  surname: string,
  free: boolean,
) =>
  await kv.set(
    profileKey(id),
    { firstName: name, lastName: surname, isFree: free } as Profile,
  );

export const sorting = (profile1: Profile, profile2: Profile) => {
  if (profile1.lastName != profile2.lastName) {
    return profile1.lastName.localeCompare(profile2.lastName);
  }
  return profile1.firstName.localeCompare(profile2.firstName);
};

export const profilesToIds = async () => {
  const profiles = await Array.fromAsync(
    kv.list<Profile>({ prefix: ["profile"] }),
    (e) => ({
      ...e.value,
      id: e.key[1],
    }),
  );
  return profiles.map((e) =>
    `${e.firstName} ${e.lastName}'s id: ${e.id.toString()}`
  ).join("\n");
};
