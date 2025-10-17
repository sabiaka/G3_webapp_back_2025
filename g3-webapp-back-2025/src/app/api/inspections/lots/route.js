import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const sectionCode = searchParams.get('section');
    if (!sectionCode) {
      return NextResponse.json(
        { message: '必須クエリパラメータ "section" が不足しています。' },
        { status: 400 }
      );
    }

    let targetDate = searchParams.get('date');
    if (!targetDate) {
      // タイムゾーンを考慮せず、単純にマシンが実行されている環境の「今日」を取得
      targetDate = new Date().toISOString().split('T')[0];
    }

    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    const offset = (page - 1) * limit;

    const totalCountQuery = `
      SELECT COUNT(*)
      FROM inspection_lots
      WHERE section_code = $1 AND to_char(captured_at, 'YYYY-MM-DD') = $2;
    `;
    const totalCountResult = await pool.query(totalCountQuery, [sectionCode, targetDate]);
    const totalLots = parseInt(totalCountResult.rows[0].count, 10);
    const totalPages = Math.ceil(totalLots / limit);

    const lotsQuery = `
      SELECT
          l.lot_id,
          sec.section_name AS section,
          l.captured_at,
          NOT EXISTS (
              SELECT 1 FROM inspection_camera_shots s_fail
              WHERE s_fail.lot_id_ref = l.id AND s_fail.status = 'FAIL'
          ) AS pass,
          COALESCE(
              jsonb_agg(
                  jsonb_build_object('camera_id', s.camera_id, 'status', s.status)
                  ORDER BY s.camera_id
              ) FILTER (WHERE s.id IS NOT NULL),
              '[]'::jsonb
          ) AS cameras
      FROM
          inspection_lots l
      LEFT JOIN
          inspection_sections sec ON l.section_code = sec.section_code
      LEFT JOIN
          inspection_camera_shots s ON s.lot_id_ref = l.id
      WHERE
          -- ★ CAST(.. AS DATE) を to_charでの文字列比較に変更
          l.section_code = $1 AND to_char(l.captured_at, 'YYYY-MM-DD') = $2
      GROUP BY
          l.id, sec.section_name
      ORDER BY
          l.captured_at DESC
      LIMIT $3
      OFFSET $4;
    `;
    const lotsResult = await pool.query(lotsQuery, [sectionCode, targetDate, limit, offset]);

    const responseData = {
      total_pages: totalPages,
      current_page: page,
      lots: lotsResult.rows,
    };

    return NextResponse.json(responseData);

  } catch (error) {
    console.error('DBエラー発生！:', error);
    return NextResponse.json(
      { message: 'サーバーでエラーが発生しました。' },
      { status: 500 }
    );
  }
}