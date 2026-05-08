import { createClient } from "@/lib/supabase/server";

export interface PublicSalon {
  id: string;
  name: string;
  /** 論理削除されていないセラピスト（在籍）人数 */
  therapistCount: number;
}

export async function getPublicSalons(): Promise<PublicSalon[]> {
  const supabase = await createClient();
  const pageSize = 1000;
  const rows: { id: string; name: string; therapist_count: number }[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .rpc("get_public_salons")
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error("getPublicSalons (rpc):", error.message);
      return [];
    }

    const chunk = (data ?? []) as { id: string; name: string; therapist_count: number }[];
    rows.push(...chunk);

    if (chunk.length < pageSize) {
      break;
    }
  }

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    therapistCount: row.therapist_count ?? 0,
  }));
}
