"use server";
import { redirect } from "next/navigation";
import { withProfile } from "./profile-session";
import { runVisionAnalysis } from "./vision-core";
import { bounce } from "./action-error";
export async function analyzePhoto(f: FormData) {
  const id = String(f.get("photo_id") || ""), itemId = String(f.get("item_id") || "");
  const result = await withProfile(async (c, userId) => runVisionAnalysis(c, userId, id));
  if (result && !result.ok) bounce(`/closet/${itemId}`, result.message || "Não foi possível analisar a foto.");
  redirect(`/closet/${itemId}`);
}
