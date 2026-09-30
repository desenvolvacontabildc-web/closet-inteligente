"use server";
import { redirect } from "next/navigation";
import { withProfile } from "./profile-session";
import { prepareVisionAnalysis, callVisionAI, writeVisionResult } from "./vision-core";
import { bounce } from "./action-error";
export async function analyzePhoto(f: FormData) {
  const id = String(f.get("photo_id") || ""), itemId = String(f.get("item_id") || "");
  const prep = await withProfile(async (c, userId) => prepareVisionAnalysis(c, userId, id));
  if (!prep) redirect("/");
  if (!prep.ok) bounce(`/closet/${itemId}`, prep.message);
  const result = await callVisionAI(prep.dataUrl);
  if (!result.ok) bounce(`/closet/${itemId}`, result.message);
  const saved = await withProfile(async (c, userId) => { await writeVisionResult(c, userId, prep.itemId, result.parsed); return true; });
  if (!saved) redirect("/");
  redirect(`/closet/${itemId}`);
}
