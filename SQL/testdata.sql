-- 従業員管理API 設計書 rolesテーブルへの仮データ
INSERT INTO roles (role_name, is_admin) VALUES
  ('管理者', TRUE),
  ('一般従業員', FALSE);

-- 従業員管理API 設計書 production_linesテーブルへの仮データ
INSERT INTO production_lines (line_name) VALUES
  ('Aライン'),
  ('Bライン');

-- 従業員管理API 設計書 employeesテーブルへの仮データ
-- ※パスワードは実際にはハッシュ化して保存します
INSERT INTO employees (employee_name,employee_user_id,employee_password,employee_is_active,employee_role_id,employee_line_id,employee_special_notes,employee_color_code) VALUES
('山田 太郎','t.yamada','123456',true,1,1,'フォークリフト免許保持','a3a8e6');




-- reports (日報) テーブルへの仮データ挿入
--INSERT INTO reports (report_employee_id, report_date, report_product_name, report_line_id, report_production_result, report_today_work, report_memo) VALUES
--(1, '2025-07-24', 'システム保守', 1, NULL, 'サーバーの定期メンテナンスを実施。', '特に問題なし。'),
--(2, '2025-07-24', '製品A', 1, 155, '製品Aの組立作業。', '部品の供給がスムーズだった。'),
--(3, '2025-07-24', '製品B', 2, 210, '製品Bの塗装作業。', '新人への指導を実施。'),
--(4, '2025-07-24', '製品C', 3, 500, '製品Cの外観検査。', '軽微な傷を2件発見。'),
--(5, '2025-07-24', '製品D', 4, 300, '製品Dの梱包および出荷準備。', '梱包材が残りわずか。');




-- 製造出荷指示API 設計書 prioritiesテーブルへの仮データ
INSERT INTO priorities (priority_label) VALUES
('至急対応'),
('通常対応'),
('高'),
('中'),
('低');

-- 製造出荷指示API 設計書 notificationsテーブルへの仮データ
INSERT INTO notifications (
    notification_line_id,
    notification_quantity,
    notification_item_name,
    notification_item_size,
    notification_color,
    notification_spring_type,
    notification_accessories,
    notification_delivery_method,
    notification_delivery_address,
    notification_delivery_company,
    notification_remarks,
    notification_priority_id,
    is_completed
) VALUES (
    1,                       -- production_linesテーブルに存在するline_id
    10,                      -- 数量
    'テスト商品',             -- 商品名
    '10x10',                 -- サイズ
    '白',                    -- 色
    '1.0mmポケットコイル',    -- バネの種類
    '予備ネジ10個',           -- 付属品
    'テスト便',               -- 配送方法
    '東京都xx区1-2-3',        -- 配送先住所
    'テスト会社',             -- 配送会社（NULLも可）
    'テスト',                 -- 備考（NULLも可）
    1,                       -- prioritiesテーブルに存在するpriority_id
    false                    -- 完了状態 (true または false)
);




-- 生産機械状況API 設計書 machinesテーブルへの仮データ挿入
INSERT INTO machines (machine_name) VALUES
('プレス機Mk-I'),
('自動塗装機-02'),
('画像検査装置-Z'),
('自動梱包機-X1'),
('特殊加工機-α');

-- 生産機械状況API 設計書 machine_statusテーブルへの仮データ
INSERT INTO machine_status (machine_id, status, machine_last_inspection) VALUES
(1, '稼働中', '2025-07-01'),
(2, '停止中', '2025-07-20'),
(3, '稼働中', '2025-06-15'),
(4, '異常あり', '2025-05-10'),
(5, 'メンテ中', '2025-07-22');

-- 生産機械状況API 設計書 machine_logsテーブルへの仮データ
INSERT INTO machine_logs (machine_name, unit_id, timestamp, log_type, title, message) VALUES
-- プレス機Mk-I（unit_id 1,2,3 想定）
('半自動表層バネどめ機', NULL, '2025-07-15 10:15:32', 'error',   'E-001: 非常停止ボタン作動', '非常停止が検知され、機械が即時停止。'),
('半自動表層バネどめ機', 2,    '2025-07-15 09:45:00', 'error',   'E-002: 残弾数 致命的低下', '弾数が致命的に少なく、運転継続不可。'),
('半自動表層バネどめ機', NULL, '2025-07-15 09:00:00', 'error',   'E-003: 点検時期 超過',     'DBで管理する点検期限を超過。安全のため停止。'),
('半自動表層バネどめ機', NULL, '2025-07-15 08:30:00', 'error',   'E-099: その他 致命的停止エラー', '上記以外の致命的な停止原因（PLCからの致命アラーム等）。'),
('半自動表層バネどめ機', 2,    '2025-07-15 08:10:00', 'warning', 'W-001: 残弾数 低下',       '弾数が少なく、補充推奨。'),
('半自動表層バネどめ機', NULL, '2025-07-15 08:05:00', 'warning', 'W-002: 点検時期 間近',     'DBで管理する点検期限が近い。計画調整推奨。'),
('半自動表層バネどめ機', NULL, '2025-07-15 08:02:00', 'warning', 'W-099: その他 軽微なエラー', '停止を伴わない軽微な異常。'),
('半自動表層バネどめ機', NULL, '2025-07-15 08:00:05', 'info',    'I-001: 生産機械 通電（JETSON検知）', ''),
('半自動表層バネどめ機', NULL, '2025-07-15 08:01:00', 'info',    'I-002: PLC スタンバイ', 'PLCが待機状態になったことを通知。'),
('半自動表層バネどめ機', NULL, '2025-07-15 18:00:00', 'info',    'I-003: 生産機械 シャットダウン（JETSON検知）', '機械の電源OFF（シャットダウン）を検知。'),
('半自動表層バネどめ機', 1,    '2025-07-16 11:20:00', 'warning', 'W-001: 残弾数 低下', '塗料残量が少なく、補充推奨。'),
('半自動表層バネどめ機', NULL, '2025-07-16 07:55:00', 'info',    'I-001: 生産機械 通電（JETSON検知）', ''),
('半自動表層バネどめ機', NULL, '2025-07-17 10:00:00', 'error',   'E-099: その他 致命的停止エラー', 'カメラリンク断で停止。'),
('半自動表層バネどめ機', NULL, '2025-07-17 09:00:00', 'info',    'I-002: PLC スタンバイ', '検査装置が待機状態に移行。'),
('半自動表層バネどめ機', NULL, '2025-07-17 08:00:00', 'info',    'I-001: 生産機械 通電（JETSON検知）', '');




-- inspection_results (検査画像) テーブルへの仮データ挿入
--INSERT INTO inspection_results (
--    inspection_camera_id,
--    inspection_product_id,
--    inspection_result,
--    inspection_reason,
--    inspection_image_path
--) VALUES 
--    ('A-main01', 'A-テスト', 'FAIL', '右下部に打痕あり', '/A-102-011.jpg'),
--    ('A-stitch01', 'A-テスト', 'PASS', NULL, '/A-102-012.jpg'),
--    ('A-stitch02', 'A-テスト', 'PASS', NULL, '/B-005-001.jpg'),
--    ('B-spring01', 'B-テスト', 'FAIL', '異物の付着を検出', '/A-102-013.jpg'),
--    ('B-spring02', 'B-テスト', 'FAIL', 'バネ取り付け角度規定外', '/B-005-002.jpg'),
--    ('B-spring03', 'B-テスト', 'PASS', NULL, '/A-102-014.jpg'),
--    ('B-spring04', 'B-テスト', 'PASS', NULL, '/B-005-003.jpg');




--画像検査API設計書（Re:仕様変更）inspection_sections テーブルへのINSERT文
INSERT INTO inspection_sections (section_code, section_name) VALUES
('spring', 'バネ留め'),
('alayer', 'A層検査');

--画像検査API設計書（Re:仕様変更）inspection_lots テーブルへのINSERT文
INSERT INTO inspection_lots (lot_id, section_code, captured_at) VALUES
('MAT-10001', 'spring', '2025-10-07 13:00:00+09'),
('MAT-10002', 'alayer', '2025-10-07 13:05:00+09'),
('MAT-10003', 'spring', '2025-10-07 13:10:00+09');

--画像検査API設計書（Re:仕様変更）inspection_camera_shots テーブルへのINSERT文
--ケース1: 正常(PASS)と異常(FAIL)が混在するロット
INSERT INTO inspection_camera_shots (lot_id_ref, camera_id, status, details, image_path, captured_at) VALUES
-- 1台目のカメラは正常
((SELECT id FROM inspection_lots WHERE lot_id = 'MAT-10001'), 'S-CAM-01', 'PASS', NULL, '/images/mat10001_scam01.jpg', '2025-10-07 12:59:58+09'),
-- 2台目のカメラは異常
((SELECT id FROM inspection_lots WHERE lot_id = 'MAT-10001'), 'S-CAM-02', 'FAIL', '異物混入', '/images/mat10001_scam02.jpg', '2025-10-07 13:00:01+09');

--画像検査API設計書（Re:仕様変更）inspection_camera_shots テーブルへのINSERT文
--ケース2: 撮影失敗(MISSING)を含むロット
INSERT INTO inspection_camera_shots (lot_id_ref, camera_id, status, details, image_path, captured_at) VALUES
-- メインカメラは正常
((SELECT id FROM inspection_lots WHERE lot_id = 'MAT-10002'), 'A-CAM-MAIN', 'PASS', NULL, '/images/mat10002_acam_main.jpg', '2025-10-07 13:05:00+09'),
-- サブカメラは撮影失敗
((SELECT id FROM inspection_lots WHERE lot_id = 'MAT-10002'), 'A-CAM-SUB', 'MISSING', '通信エラー', NULL, '2025-10-07 13:05:02+09');

--画像検査API設計書（Re:仕様変更）inspection_camera_shots テーブルへのINSERT文
--ケース3: 同じカメラで複数回撮影するロット
INSERT INTO inspection_camera_shots (lot_id_ref, camera_id, status, details, image_path, shot_seq, captured_at) VALUES
-- 1台目のカメラの1回目の撮影
((SELECT id FROM inspection_lots WHERE lot_id = 'MAT-10003'), 'S-CAM-01', 'PASS', NULL, '/images/mat10003_scam01_seq1.jpg', 1, '2025-10-07 13:09:59+09'),
-- 1台目のカメラの2回目の撮影
((SELECT id FROM inspection_lots WHERE lot_id = 'MAT-10003'), 'S-CAM-01', 'PASS', NULL, '/images/mat10003_scam01_seq2.jpg', 2, '2025-10-07 13:10:00+09'),
-- 2台目のカメラの撮影
((SELECT id FROM inspection_lots WHERE lot_id = 'MAT-10003'), 'S-CAM-02', 'PASS', NULL, '/images/mat10003_scam02.jpg', 1, '2025-10-07 13:10:01+09');




-- machine_production (ホックリング残数・生産数) テーブルへの仮データ挿入
--INSERT INTO machine_production (machine_prod_hook_remaining, machine_prod_count) VALUES
--(5000, 10250),
--(4850, 10400),
--(4700, 10550),
--(4550, 10700),
--(4400, 10850);




-- 生産数管理API 設計書 production_reportsテーブルへの仮データ
INSERT INTO production_reports (prodreport_date,prodreport_product_name,prodreport_plan_quantity,prodreport_actual_quantity,prodreport_achievement_rate,prodreport_defective_quantity,prodreport_employee_id,prodreport_remarks) VALUES
('2025-10-02', 'テストA', 150, 148, 98.67, 2, 2, '若干遅延あり'),
('2025-10-03', 'テストB', 200, 200, 100.00, 0, 4, NULL),
('2025-10-04', 'テストC', 80, 79, 98.75, 1, 5, '傷があったため1つ破棄');




--部品在庫管理API 設計書 棚作成用の仮データ
INSERT INTO racks (rack_name, rows, cols) VALUES
('スプリング・小物資材ラック', 3, 4);

--部品在庫管理API 設計書　上記rack_id=1に部品追加
INSERT INTO slots (rack_id, slot_identifier, part_name, part_model_number, quantity, color_code) VALUES
(1, 'A-1', 'ポケットコイル', 'PC-S-H20', 25, '#FF5733');

--部品在庫管理API 設計書 空スロット用
INSERT INTO slots (rack_id, slot_identifier)VALUES
(1, 'A-2');

-- ------------------------------------------------------------------
-- Generated test data from SQL/useLotsData.js
-- Inserts inspection_lots and inspection_camera_shots
-- Uses ON CONFLICT DO NOTHING for inspection_lots to avoid duplicate lot_id errors
-- ------------------------------------------------------------------

-- inspection_lots
INSERT INTO inspection_lots (lot_id, section_code, captured_at) VALUES
('MAT-09030', 'spring', '2025-09-30T09:15:12.000Z'),
('LOLL-09030', 'alayer', '2025-09-30T11:05:30.000Z'),
('MAT-10001', 'spring', '2025-10-01T17:47:53.427Z'),
('MAT-10002', 'spring', '2025-10-01T17:50:12.123Z'),
('MAT-10003', 'spring', '2025-10-01T17:52:30.555Z'),
('LOLL-10001', 'alayer', '2025-10-01T17:47:53.427Z'),
('LOLL-10002', 'alayer', '2025-10-01T17:49:10.789Z'),
('LOLL-10003', 'alayer', '2025-10-01T17:51:05.321Z'),
('MAT-10002', 'spring', '2025-10-02T01:10:00.000Z'),
('LOLL-10002', 'alayer', '2025-10-02T04:00:00.000Z')
ON CONFLICT (lot_id) DO NOTHING;

-- inspection_camera_shots
-- Lot ID: 1 (MAT-09030 / spring)
INSERT INTO inspection_camera_shots (lot_id_ref, camera_id, status, details, image_path, shot_seq, captured_at) VALUES
(1, 'B-spring01', 'PASS', NULL, 'MAT-09030_B-spring01.jpg', 1, '2025-10-01 09:15:12+00'),
(1, 'B-spring02', 'PASS', NULL, 'MAT-09030_B-spring02.jpg', 1, '2025-10-01 09:15:12+00'),
(1, 'B-spring03', 'PASS', NULL, 'MAT-09030_B-spring03.jpg', 1, '2025-10-01 09:15:12+00');

-- Lot ID: 2 (LOLL-09030 / alayer)
INSERT INTO inspection_camera_shots (lot_id_ref, camera_id, status, details, image_path, shot_seq, captured_at) VALUES
(2, 'A-main01', 'FAIL', 'A層ヨゴレ', 'LOLL-09030_A-main01.jpg', 1, '2025-10-01 11:05:30+00'),
(2, 'A-stitch01', 'PASS', NULL, 'LOLL-09030_A-stitch01.jpg', 1, '2025-10-01 11:05:30+00'),
(2, 'A-stitch02', 'PASS', NULL, 'LOLL-09030_A-stitch02.jpg', 1, '2025-10-01 11:05:30+00');

-- Lot ID: 3 (MAT-10001 / spring)
INSERT INTO inspection_camera_shots (lot_id_ref, camera_id, status, details, image_path, shot_seq, captured_at) VALUES
(3, 'B-spring01', 'FAIL', 'バネ取り付け角度規定外', 'MAT-10001_B-spring01.jpg', 1, '2025-10-01 17:47:53.427+00'),
(3, 'B-spring02', 'PASS', NULL, 'MAT-10001_B-spring02.jpg', 1, '2025-10-01 17:47:53.427+00'),
(3, 'B-spring03', 'PASS', NULL, 'MAT-10001_B-spring03.jpg', 1, '2025-10-01 17:47:53.427+00');

-- Lot ID: 4 (MAT-10002 / spring)
INSERT INTO inspection_camera_shots (lot_id_ref, camera_id, status, details, image_path, shot_seq, captured_at) VALUES
(4, 'B-spring01', 'PASS', NULL, 'MAT-10002_B-spring01.jpg', 1, '2025-10-01 17:50:12.123+00'),
(4, 'B-spring02', 'PASS', NULL, 'MAT-10002_B-spring02.jpg', 1, '2025-10-01 17:50:12.123+00'),
(4, 'B-spring03', 'PASS', NULL, 'MAT-10002_B-spring03.jpg', 1, '2025-10-01 17:50:12.123+00');

-- Lot ID: 5 (MAT-10003 / spring)
INSERT INTO inspection_camera_shots (lot_id_ref, camera_id, status, details, image_path, shot_seq, captured_at) VALUES
(5, 'B-spring01', 'PASS', NULL, 'MAT-10003_B-spring01.jpg', 1, '2025-10-01 17:52:30.555+00'),
(5, 'B-spring02', 'FAIL', 'バネ外れ', 'MAT-10003_B-spring02.jpg', 1, '2025-10-01 17:52:30.555+00'),
(5, 'B-spring03', 'PASS', NULL, 'MAT-10003_B-spring03.jpg', 1, '2025-10-01 17:52:30.555+00');

-- Lot ID: 6 (LOLL-10001 / alayer)
INSERT INTO inspection_camera_shots (lot_id_ref, camera_id, status, details, image_path, shot_seq, captured_at) VALUES
(6, 'A-main01', 'PASS', NULL, 'LOLL-10001_A-main01.jpg', 1, '2025-10-01 17:47:53.427+00'),
(6, 'A-stitch01', 'PASS', NULL, 'LOLL-10001_A-stitch01.jpg', 1, '2025-10-01 17:47:53.427+00'),
(6, 'A-stitch02', 'FAIL', '糸ほつれ', 'LOLL-10001_A-stitch02.jpg', 1, '2025-10-01 17:47:53.427+00');

-- Lot ID: 7 (LOLL-10002 / alayer)
INSERT INTO inspection_camera_shots (lot_id_ref, camera_id, status, details, image_path, shot_seq, captured_at) VALUES
(7, 'A-main01', 'PASS', NULL, 'LOLL-10002_A-main01.jpg', 1, '2025-10-01 17:49:10.789+00'),
(7, 'A-stitch01', 'PASS', NULL, 'LOLL-10002_A-stitch01.jpg', 1, '2025-10-01 17:49:10.789+00'),
(7, 'A-stitch02', 'PASS', NULL, 'LOLL-10002_A-stitch02.jpg', 1, '2025-10-01 17:49:10.789+00');

-- Lot ID: 8 (LOLL-10003 / alayer)
INSERT INTO inspection_camera_shots (lot_id_ref, camera_id, status, details, image_path, shot_seq, captured_at) VALUES
(8, 'A-main01', 'FAIL', 'ゴミ付着', 'LOLL-10003_A-main01.jpg', 1, '2025-10-01 17:51:05.321+00'),
(8, 'A-stitch01', 'PASS', NULL, 'LOLL-10003_A-stitch01.jpg', 1, '2025-10-01 17:51:05.321+00'),
(8, 'A-stitch02', 'FAIL', '糸ほつれ', 'LOLL-10003_A-stitch02.jpg', 1, '2025-10-01 17:51:05.321+00');