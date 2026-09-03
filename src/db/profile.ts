import { kv } from "../mod.ts";

export interface Profile {
  firstName: string;
  lastName: string;
  isFree: boolean;
}

export interface Ban {
  firstName: string;
  lastName: string;
  at: string;
}

const profileKey = (id: number) => ["profile", id];
const banKey = (id: number) => ["ban", id];

export const normalizeName = (s: string) => s.trim().toLocaleLowerCase("ru");

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
  const needle = normalizeName(lastName);
  return (await listProfiles()).filter(
    (p) => normalizeName(p.lastName) === needle,
  );
};

export const sorting = (profile1: Profile, profile2: Profile) => {
  return (profile1.lastName != profile2.lastName)
    ? profile1.lastName.localeCompare(profile2.lastName)
    : profile1.firstName.localeCompare(profile2.firstName);
};

// ---------- баны ----------

export const isBanned = async (id: number) =>
  (await kv.get<Ban>(banKey(id))).value !== null;

export const setBan = async (id: number, ban: Ban) =>
  await kv.set(banKey(id), ban);

export const removeBan = async (id: number) => await kv.delete(banKey(id));

export const listBans = async () =>
  await Array.fromAsync(
    kv.list<Ban>({ prefix: ["ban"] }),
    (e) => ({ id: Number(e.key[1]), ...e.value }),
  );

// ищем по списку банов, а не по профилям: профиль мог быть удалён
export const findBansByLastName = async (lastName: string) => {
  const needle = normalizeName(lastName);
  return (await listBans()).filter((b) => normalizeName(b.lastName) === needle);
};
