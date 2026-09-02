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

export const getIds = async () =>
  (await Array.fromAsync(
    kv.list<Profile>({ prefix: ["profile"] }),
    (e) => Number(e.key[1]),
  ));

export const listProfiles = async () =>
  await Array.fromAsync(
    kv.list<Profile>({ prefix: ["profile"] }),
    (e) => ({ id: Number(e.key[1]), ...e.value }),
  );

// ищем ТОЛЬКО по фамилии — иначе фамилию вида "2" не найти
export const findByLastName = async (lastName: string) => {
  const needle = lastName.trim().toLocaleLowerCase("ru");
  return (await listProfiles()).filter(
    (p) => p.lastName.trim().toLocaleLowerCase("ru") === needle,
  );
};

export const sorting = (profile1: Profile, profile2: Profile) => {
  return (profile1.lastName != profile2.lastName)
    ? profile1.lastName.localeCompare(profile2.lastName)
    : profile1.firstName.localeCompare(profile2.firstName);
};
