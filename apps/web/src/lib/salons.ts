import { createClient } from "@/lib/supabase/server";

export interface PublicSalon {
  id: string;
  name: string;
  /** 論理削除されていないセラピスト（在籍）人数 */
  therapistCount: number;
  /** 外部ポータルから取得した都道府県名。未リンク or 未取得は null。 */
  prefecture: string | null;
  /** 外部ポータル基準のエリア名 (例: '新橋・銀座')。未取得時は空配列。 */
  areas: string[];
}

interface PublicSalonRow {
  id: string;
  name: string;
  therapist_count: number;
  prefecture: string | null;
  areas: string[] | null;
}

export async function getPublicSalons(): Promise<PublicSalon[]> {
  const supabase = await createClient();
  const pageSize = 1000;
  const rows: PublicSalonRow[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .rpc("get_public_salons")
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error("getPublicSalons (rpc):", error.message);
      return [];
    }

    const chunk = (data ?? []) as PublicSalonRow[];
    rows.push(...chunk);

    if (chunk.length < pageSize) {
      break;
    }
  }

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    therapistCount: row.therapist_count ?? 0,
    prefecture: row.prefecture ?? null,
    areas: row.areas ?? [],
  }));
}
