// 데모 안전망: src/data/cached/ 의 사전 생성 파일을 읽는다.
// 라이브 API가 죽어도 전체 흐름이 도는 마지막 보루다.

import { promises as fs } from "fs";
import path from "path";

const CACHE_DIR = path.join(process.cwd(), "src", "data", "cached");

export async function readCacheText(file: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(CACHE_DIR, file), "utf-8");
  } catch {
    return null;
  }
}

export async function readCacheBuffer(file: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(path.join(CACHE_DIR, file));
  } catch {
    return null;
  }
}

export async function readCacheJson<T>(file: string): Promise<T | null> {
  const text = await readCacheText(file);
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
