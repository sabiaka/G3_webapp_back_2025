/**
 * ファイル概要
 * ==========
 * このファイルは データベース内のテーブル一覧を取得するAPIを提供します。
 * PostgreSQLの情報スキーマからテーブル名とコメントを取得して返します。
 */
import { NextResponse } from 'next/server';
import db from '@/lib/db'; // データベース接続設定をインポート

/**
 * データベーステーブル一覧を取得するAPI (GET)
 * --------------------------------------
 * PostgreSQLの情報スキーマから、publicスキーマ内の全テーブル情報を取得します。
 *
 * 成功時の戻り値（200）
 * - table_name : テーブル名（文字列）
 * - table_type : テーブルタイプ（BASE TABLE / VIEW など）
 * - comment    : テーブルのコメント（あれば）
 *
 * エラー
 * - 500 サーバーエラー：DBアクセス等で異常が発生した場合。
 */
export async function GET(request) {
  try {
    // ========================================
    // PostgreSQLのメタデータからテーブル一覧を取得
    // ========================================
    // なぜformat関数を使うのか: テーブル名に特殊文字が含まれる場合でも正しく識別子をエスケープできるため
    const query = `
      SELECT
        t.table_name,
        t.table_type,
        obj_description(format('%I.%I', t.table_schema, t.table_name)::regclass, 'pg_class') as comment
      FROM information_schema.tables t
      WHERE t.table_schema = 'public'
      ORDER BY t.table_name ASC;
    `;
    
    const result = await db.query(query);
    
    // テーブル情報を返す
    return NextResponse.json({
      count: result.rows.length,
      tables: result.rows
    });
  } catch (error) {
    console.error('テーブル一覧取得時にDBエラーが発生しました:', error);
    return NextResponse.json(
      { message: 'サーバーでエラーが発生しました。' },
      { status: 500 }
    );
  }
}
