-- roles (権限) テーブルへの仮データ挿入
INSERT INTO roles (role_name, is_admin) VALUES
  ('管理者', TRUE),
  ('一般従業員', FALSE);

-- production_lines (担当ライン) テーブルへの仮データ挿入
INSERT INTO production_lines (line_name) VALUES
  ('Aライン'),
  ('Bライン');

-- employees (従業員) テーブルへの仮データ挿入
-- パスワードは実際にはハッシュ化して保存してください
INSERT INTO employees (employee_name,employee_user_id,employee_password,employee_is_active,employee_role_id,employee_line_id,employee_special_notes,employee_color_code) VALUES
('山田 太郎','t.yamada','123456',true,1,1,'フォークリフト免許保持','a3a8e6');


-- reports (日報) テーブルへの仮データ挿入
INSERT INTO reports (report_employee_id, report_date, report_product_name, report_line_id, report_production_result, report_today_work, report_memo) VALUES
(1, '2025-07-24', 'システム保守', 1, NULL, 'サーバーの定期メンテナンスを実施。', '特に問題なし。'),
(2, '2025-07-24', '製品A', 1, 155, '製品Aの組立作業。', '部品の供給がスムーズだった。'),
(3, '2025-07-24', '製品B', 2, 210, '製品Bの塗装作業。', '新人への指導を実施。'),
(4, '2025-07-24', '製品C', 3, 500, '製品Cの外観検査。', '軽微な傷を2件発見。'),
(5, '2025-07-24', '製品D', 4, 300, '製品Dの梱包および出荷準備。', '梱包材が残りわずか。');

-- priorities (優先度) テーブルへの仮データ挿入
INSERT INTO priorities (priority_label) VALUES
('至急対応'),
('通常対応'),
('高'),
('中'),
('低');

-- notifications (生産目標通知) テーブルへの仮データ挿入
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
    10,                       -- 数量
    'テスト商品',          -- 商品名
    '10x10',              -- サイズ
    '白',                -- 色
    '1.0mmポケットコイル',   -- バネの種類
    '予備ネジ10個',              -- 付属品
    'テスト便',              -- 配送方法
    '東京都xx区1-2-3', -- 配送先住所
    'テスト会社',               -- 配送会社（NULLも可）
    'テスト',        -- 備考（NULLも可）
    1,                       -- prioritiesテーブルに存在するpriority_id
    false                    -- 完了状態 (true または false)
);




-- machines (機械名) テーブルへの仮データ挿入
INSERT INTO machines (machine_name) VALUES
('プレス機Mk-I'),
('自動塗装機-02'),
('画像検査装置-Z'),
('自動梱包機-X1'),
('特殊加工機-α');

-- machine_status (生産機械状況) テーブルへの仮データ挿入
INSERT INTO machine_status (
  machine_id, status, machine_last_inspection
)
VALUES
(1, '稼働中', '2025-07-01'),
(2, '停止中', '2025-07-20'),
(3, '稼働中', '2025-06-15'),
(4, '異常あり', '2025-05-10'),
(5, 'メンテ中', '2025-07-22');

-- 【machine_logs（機械ログ履歴）】テスト用データ挿入（新スキーマ: machine_name, unit_id, timestamp, log_type, title, message）
INSERT INTO machine_logs (machine_name, unit_id, timestamp, log_type, title, message)
VALUES
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
INSERT INTO inspection_results (inspection_status, inspection_trouble_info, inspection_image_path) VALUES
('PASS', NULL, '/images/inspection/20250901_01.jpg'),
('FAIL', '位置ずれ', '/images/inspection/20250901_02.jpg');



-- machine_production (ホックリング残数・生産数) テーブルへの仮データ挿入
INSERT INTO machine_production (machine_prod_hook_remaining, machine_prod_count) VALUES
(5000, 10250),
(4850, 10400),
(4700, 10550),
(4550, 10700),
(4400, 10850);

-- production_reports (生産数管理) テーブルへの仮データ挿入
INSERT INTO production_reports (prodreport_date,prodreport_product_name,prodreport_plan_quantity,prodreport_actual_quantity,prodreport_achievement_rate,prodreport_defective_quantity,prodreport_employee_id,prodreport_remarks) VALUES
('2025-10-02', 'テストA', 150, 148, 98.67, 2, 2, '若干遅延あり'),
('2025-10-03', 'テストB', 200, 200, 100.00, 0, 4, NULL),
('2025-10-04', 'テストC', 80, 79, 98.75, 1, 5, '傷があったため1つ破棄');


--棚作成
INSERT INTO racks (rack_name, rows, cols) VALUES
('スプリング・小物資材ラック', 3, 4);

--上記rack_id=1('スプリング・小物資材ラック')に部品追加
INSERT INTO slots (rack_id, slot_identifier, part_name, part_model_number, quantity, color_code) VALUES
(1, 'A-1', 'ポケットコイル', 'PC-S-H20', 25, '#FF5733');

--空スロット用
INSERT INTO slots (rack_id, slot_identifier)VALUES
(1, 'A-2');