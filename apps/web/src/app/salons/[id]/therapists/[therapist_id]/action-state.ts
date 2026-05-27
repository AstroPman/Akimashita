/**
 * Server Action の useActionState 用ステート型と初期値。
 *
 * `actions.ts` は "use server" ファイルなので、async function 以外の export
 * (object 定数や enum 等) はランタイムエラーになる。型と初期値は同モジュールから
 * 切り出して、Client Component から直接 import する。
 */

export type ReviewActionState =
  | {
      ok: true;
      reviewId: string;
      therapistId: string;
      rating: number;
      hasBody: boolean;
    }
  | {
      ok: false;
      message: string;
      fieldErrors?: Record<string, string[]>;
    }
  | { ok: null };

export const REVIEW_ACTION_INITIAL_STATE: ReviewActionState = { ok: null };
