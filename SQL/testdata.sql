-- roles (権限) テーブルへの仮データ挿入
INSERT INTO roles (role_name) VALUES
('管理者'),
('一般'),
('リーダー'),
('研修生'),
('パートタイム');

-- production_lines (担当ライン) テーブルへの仮データ挿入
INSERT INTO production_lines (line_name) VALUES
('組立ラインA'),
('塗装ラインB'),
('検査ラインC'),
('梱包ラインD'),
('特殊ラインE');

-- employees (従業員) テーブルへの仮データ挿入
-- パスワードは実際にはハッシュ化して保存してください
INSERT INTO employees (employee_name, employee_user_id, employee_password, employee_is_active, employee_role_name, employee_line_name, employee_special_notes, employee_color_code) VALUES
('山田 太郎', 'yamada.taro', 'password123', TRUE, 'リーダー', '組立', 'システム管理者。', 'FF5733'),
('佐藤 花子', 'sato.hanako', 'password123', TRUE, 'サブリーダー', '組立', '組立担当。', '33CFFF'),
('鈴木 一郎', 'suzuki.ichiro', 'password123', TRUE, '一般', '検査', '塗装ラインのリーダー。', 'DAF7A6'),
('田中 美咲', 'tanaka.misaki', 'password123', TRUE, '一般', '検査', '検査部門の新人。', 'FFC300'),
('伊藤 健太', 'ito.kenta', 'password123', TRUE, '一般', '検査', '梱包作業担当。', 'C70039');

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
INSERT INTO notifications (notification_line_id, notification_quantity, notification_item_name, notification_item_size, notification_color, notification_spring_type, notification_accessories, notification_delivery_method, notification_delivery_address, notification_delivery_company, notification_remarks, notification_priority_id) VALUES
(1, 500, 'フックリングV2', 'M', 'シルバー', '標準バネ', '説明書A', '通常便', '東京都千代田区1-1-1', 'ABC運送', '7月末納期厳守', 1),
(2, 1000, '装飾パネル', 'L', 'ブラック', NULL, '取付ネジセット', 'チャーター便', '大阪府大阪市北区2-2-2', 'XYZ物流', NULL, 2),
(3, 2500, '検査キット', 'S', 'クリア', NULL, NULL, '通常便', '愛知県名古屋市中区3-3-3', '東海運輸', '割れ物注意', 3),
(4, 800, '梱包箱セット', 'M', '茶', NULL, '緩衝材', '定期便', '福岡県福岡市博多区4-4-4', '九州急便', NULL, 4),
(1, 1200, 'フックリングV3', 'M', 'ゴールド', '強化バネ', '説明書B', '航空便', '北海道札幌市中央区5-5-5', '北国空輸', '至急オーダー', 1);

-- machines (機械名) テーブルへの仮データ挿入
INSERT INTO machines (machine_name) VALUES
('プレス機Mk-I'),
('自動塗装機-02'),
('画像検査装置-Z'),
('自動梱包機-X1'),
('特殊加工機-α');

-- machine_status (生産機械状況) テーブルへの仮データ挿入
INSERT INTO machine_status (machine_id, machine_status, machine_trouble_info, machine_last_inspection) VALUES
(1, '稼働中', NULL, '2025-07-01'),
(2, '停止中', '定期メンテナンスのため停止。', '2025-07-20'),
(3, '稼働中', NULL, '2025-06-15'),
(4, '異常あり', 'センサーエラー（E-05）が発生。', '2025-05-10'),
(5, 'メンテ中', '部品交換作業中。', '2025-07-22');

-- inspection_results (検査画像) テーブルへの仮データ挿入
INSERT INTO inspection_results (inspection_image_path, inspection_status, inspection_trouble_info) VALUES
('/images/inspection/20250724_001.jpg', '良品', NULL),
('/images/inspection/20250724_002.jpg', '不良', '表面に傷あり。'),
('/images/inspection/20250724_003.jpg', '良品', NULL),
('/images/inspection/20250724_004.jpg', '良品', NULL),
('/images/inspection/20250724_005.jpg', '不良', '異物混入の疑い。');

-- machine_production (ホックリング残数・生産数) テーブルへの仮データ挿入
INSERT INTO machine_production (machine_prod_hook_remaining, machine_prod_count) VALUES
(5000, 10250),
(4850, 10400),
(4700, 10550),
(4550, 10700),
(4400, 10850);

-- production_reports (生産数管理) テーブルへの仮データ挿入
INSERT INTO production_reports (prodreport_date, prodreport_product_name, prodreport_plan_quantity, prodreport_actual_quantity, prodreport_achievement_rate, prodreport_defective_quantity, prodreport_employee_id, prodreport_remarks) VALUES
('2025-07-23', '製品A', 300, 270, 90.00, 5, 2, '材料の入荷遅れにより計画未達。'),
('2025-07-23', '製品B', 200, 200, 100.00, 2, 3, '計画通り完了。'),
('2025-07-24', '製品A', 300, 310, 103.33, 3, 2, '計画を上回って生産。'),
('2025-07-24', '製品B', 200, 195, 97.50, 1, 3, '塗料のトラブルで一時停止。'),
('2025-07-24', '製品C', 500, 500, 100.00, 2, 4, '検査完了。');




INSERT INTO racks (rack_name, rows, cols) VALUES
('スプリング・小物資材ラック', 3, 4);



-- rack_id=1 の棚 ('スプリング・小物資材ラック') に部品を追加します
INSERT INTO slots (rack_id, slot_identifier, part_name, part_model_number, quantity, color_code) VALUES
(1, 'A-1', 'ポケットコイル', 'PC-S-H20', 25, '#FF5733');

INSERT INTO slots (rack_id, slot_identifier)VALUES
(1, 'A-2');