import { NextResponse } from 'next/server';
import db from '@/lib/db';

/**
 * 指定されたIDの生産ラインを更新するAPI (PUT)
 */
export async function PUT(request, { params }) {
  try {
    const { id: idParam } = await params;
    const id = parseInt(idParam, 10);
    const body = await request.json();
    const { line_name } = body;

    // --- バリデーション ---
    if (isNaN(id)) {
      return NextResponse.json({ message: 'IDが不正です。' }, { status: 400 });
    }
    if (!line_name) {
      return NextResponse.json({ message: '必須項目（line_name）が不足しています。' }, { status: 400 });
    }

    // --- DB更新処理 ---
    const query = `
      UPDATE production_lines
      SET line_name = $1
      WHERE line_id = $2
      RETURNING *;
    `;
    const values = [line_name, id];
    
    const result = await db.query(query, values);

    // 更新対象が見つからなかった場合
    if (result.rowCount === 0) {
      return NextResponse.json({ message: '指定されたIDのラインが見つかりません。' }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);

  } catch (error) {
    // --- エラーハンドリング ---
    console.error('ライン更新時にDBエラーが発生しました:', error);
    if (error.code === '23505') {
      return NextResponse.json(
        { message: '指定されたline_nameは既に使用されています。' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { message: 'サーバーでエラーが発生しました。' },
      { status: 500 }
    );
  }
}

/**
 * 指定されたIDの生産ラインを削除するAPI (DELETE)
 */
export async function DELETE(request, { params }) {
  try {
    const { id: idParam } = await params;
    const id = parseInt(idParam, 10);

    // --- バリデーション ---
    if (isNaN(id)) {
      return NextResponse.json({ message: 'IDが不正です。' }, { status: 400 });
    }

    // --- DB削除処理 ---
    const query = 'DELETE FROM production_lines WHERE line_id = $1';
    const values = [id];
    
    const result = await db.query(query, values);

    // 削除対象が見つからなかった場合
    if (result.rowCount === 0) {
      return NextResponse.json({ message: '指定されたIDのラインが見つかりません。' }, { status: 404 });
    }

    // 成功レスポンス (No Content)
    return new NextResponse(null, { status: 204 });

  } catch (error) {
    // --- エラーハンドリング ---
    console.error('ライン削除時にDBエラーが発生しました:', error);

    // 外部キー制約違反の場合
    if (error.code === '23503') {
      return NextResponse.json(
        { message: 'このラインは従業員に割り当てられているため削除できません。' },
        { status: 409 } // Conflict
      );
    }

    // その他のサーバーエラー
    return NextResponse.json(
      { message: 'サーバーでエラーが発生しました。' },
      { status: 500 }
    );
  }
}