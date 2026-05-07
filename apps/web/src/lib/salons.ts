import { createClient } from "@/lib/supabase/server";

export interface PublicSalon {
  id: string;
  name: string;
  /** 論理削除されていないセラピスト（在籍）人数 */
  therapistCount: number;
}

export async function getPublicSalons(): Promise<PublicSalon[]> {
  const supabase = await createClient();

  const [salonsResult, therapistsResult] = await Promise.all([
    supabase
      .from("salons")
      .select("id, name")
      .is("deleted_at", null)
      .order("name", { ascending: true }),
    supabase.from("therapists").select("salon_id").is("deleted_at", null),
  ]);

  if (salonsResult.error) {
    console.error("getPublicSalons (salons):", salonsResult.error.message);
    return [];
  }

  if (therapistsResult.error) {
    console.error(
      "getPublicSalons (therapists):",
      therapistsResult.error.message,
    );
  }

  const countBySalon = new Map<string, number>();
  for (const row of therapistsResult.data ?? []) {
    const sid = row.salon_id as string;
    countBySalon.set(sid, (countBySalon.get(sid) ?? 0) + 1);
  }

  const salons = (salonsResult.data ?? []) as { id: string; name: string }[];

  return salons.map((s) => ({
    id: s.id,
    name: s.name,
    therapistCount: countBySalon.get(s.id) ?? 0,
  }));
}
