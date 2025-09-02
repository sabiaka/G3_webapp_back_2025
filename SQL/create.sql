-- 【Role (権限) マスタ化】
CREATE TABLE roles (
    role_id SERIAL PRIMARY KEY,            -- 一意の権限ID（自動採番）
    role_name VARCHAR(50) UNIQUE NOT NULL  -- 権限名（例: "管理者", "一般"）
);

-- 【Production Line (担当ライン) マスタ化】
CREATE TABLE production_lines (
    line_id SERIAL PRIMARY KEY,            -- 一意のラインID（自動採番）
    line_name VARCHAR(100) UNIQUE NOT NULL -- ライン名（例: "ラインA", "ラインB"）
);

-- 【Employee ID (従業員ID) で統一管理】
CREATE TABLE employees (
    employee_id SERIAL PRIMARY KEY,         -- 従業員ID（自動採番）
    employee_name VARCHAR(100) NOT NULL,    -- 名前（フルネーム）
    employee_user_id VARCHAR(50) UNIQUE NOT NULL, -- ユーザーID（ログイン用、一意）
    employee_password VARCHAR(255) NOT NULL,      -- パスワード（ハッシュ保存推奨）
    employee_is_active BOOLEAN DEFAULT TRUE,      -- 有効/無効フラグ（TRUE=有効）
    employee_role_name VARCHAR(50) NOT NULL,      -- 権限name
    employee_line_name VARCHAR(50) NOT NULL,      -- 担当ラインname
    employee_special_notes TEXT,                 -- 特記事項（任意のメモなど）
    employee_color_code CHAR(6)                 -- カラーコード（例: "FF0000"）
    --FOREIGN KEY (employee_role_name) REFERENCES roles(role_id),
    --FOREIGN KEY (employee_line_name) REFERENCES production_lines(line_id)
);

-- 【Reports(日報)】
CREATE TABLE reports (
    report_id SERIAL PRIMARY KEY,            -- レポートID（自動採番）
    report_employee_id INT NOT NULL,         -- 担当者ID（employeesテーブルの外部キー）
    report_date DATE NOT NULL,               -- 日付（対象の日報日）
    report_product_name VARCHAR(100),        -- 製品名（任意）
    report_line_id INT NOT NULL,             -- 担当ラインID（production_linesテーブルの外部キー）
    report_production_result INT,            -- 生産結果（数量）
    report_today_work TEXT,                  -- 本日の作業内容
    report_memo TEXT,                        -- メモ・備考
    FOREIGN KEY (report_employee_id) REFERENCES employees(employee_id),
    FOREIGN KEY (report_line_id) REFERENCES production_lines(line_id)
);

-- 【Notification Priority (優先度) マスタ化】
CREATE TABLE priorities (
    priority_id SERIAL PRIMARY KEY,           -- 優先度ID（自動採番）
    priority_label VARCHAR(20) UNIQUE NOT NULL -- 優先度ラベル（例: "至急対応", "通常対応"）
);

-- 【Notifications(生産目標通知)】
CREATE TABLE notifications (
    notification_id SERIAL PRIMARY KEY,       -- 通知ID（自動採番）
    notification_data_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,  -- 通知日時（自動設定）
    notification_line_id INT NOT NULL,        -- 担当ラインID（外部キー）
    notification_quantity INT NOT NULL,       -- 生産数量
    notification_item_name VARCHAR(50),       -- 品名
    notification_item_size VARCHAR(50),       -- サイズ
    notification_color VARCHAR(50),           -- カラー
    notification_spring_type VARCHAR(50),     -- バネタイプ
    notification_accessories VARCHAR(50),     -- 同梱品
    notification_delivery_method VARCHAR(50), -- 配送方法
    notification_delivery_address VARCHAR(100), -- 配送先住所
    notification_delivery_company VARCHAR(50),  -- 配送会社名
    notification_remarks TEXT,                -- 備考
    notification_priority_id INT NOT NULL,    -- 優先度ID（外部キー）
    FOREIGN KEY (notification_line_id) REFERENCES production_lines(line_id),
    FOREIGN KEY (notification_priority_id) REFERENCES priorities(priority_id)
);

-- 【Machine Name (機械名) マスタ化】
CREATE TABLE machines (
    machine_id SERIAL PRIMARY KEY,             -- 機械ID（自動採番）
    machine_name VARCHAR(100) UNIQUE NOT NULL  -- 機械名（例: "生産機Mk-I"）
);

-- 【Machine Status(生産機械状況)】
CREATE TABLE machine_status (
    machine_status_id SERIAL PRIMARY KEY,      -- 状態ID（自動採番）
    machine_data_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- 状態記録日時
    machine_id INT NOT NULL,                   -- 機械ID（machinesテーブルの外部キー）
    machine_status VARCHAR(20) NOT NULL CHECK (machine_status IN ('稼働中', '停止中', '異常あり', 'メンテ中')), -- 状態を限定
    machine_trouble_info TEXT,                 -- 不具合情報
    machine_last_inspection DATE,              -- 最終点検日
    FOREIGN KEY (machine_id) REFERENCES machines(machine_id)
);


-- 【Inspection Images (検査画像) の分離構造(必要に応じて)】
CREATE TABLE inspection_results (
    inspection_id SERIAL PRIMARY KEY,           -- 検査ID（自動採番）
    inspection_image_path TEXT NOT NULL,        -- 検査画像パス
    inspection_captured_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- 撮影日時
    inspection_status VARCHAR(50) NOT NULL,     -- 検査結果（良品、不良など）
    inspection_trouble_info TEXT                -- 問題点詳細
);

-- 【Machine Production(ホックリング残数・生産数)】
CREATE TABLE machine_production (
    machine_prod_id SERIAL PRIMARY KEY,          -- 生産データID（自動採番）
    machine_prod_captured_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- 記録日時
    machine_prod_hook_remaining INT NOT NULL,    -- ホックリング残数
    machine_prod_count INT NOT NULL              -- 生産数
);

-- 【Production Report(生産数管理)】
CREATE TABLE production_reports (
    prodreport_id SERIAL PRIMARY KEY,             -- 生産レポートID（自動採番）
    prodreport_date DATE NOT NULL,                -- 日付
    prodreport_product_name VARCHAR(100) NOT NULL,-- 製品名
    prodreport_plan_quantity INT NOT NULL,        -- 計画数量
    prodreport_actual_quantity INT NOT NULL,      -- 実績数量
    prodreport_achievement_rate DECIMAL(5,2),     -- 達成率（例: 95.00）
    prodreport_defective_quantity INT NOT NULL,   -- 不良数
    prodreport_employee_id INT,                   -- 担当者ID（employeesテーブルの外部キー）
    prodreport_remarks TEXT,                      -- 備考
    FOREIGN KEY (prodreport_employee_id) REFERENCES employees(employee_id)
);






CREATE TABLE racks (
    -- 棚固有のID (自動採番)
    rack_id SERIAL PRIMARY KEY,
    -- 棚の名前 (例: メッシュラック #1)
    rack_name VARCHAR(255) NOT NULL UNIQUE,
    -- 棚の行数 (例: 3)。0以下の値は登録できない
    rows INT NOT NULL CHECK (rows > 0),
    -- 棚の列数 (例: 4)。0以下の値は登録できない
    columns INT NOT NULL CHECK (columns > 0)
);

CREATE TABLE parts_inventory (
    -- 在庫データ固有のID (自動採番)
    id SERIAL PRIMARY KEY,
    -- どの棚にあるかを示すID (racksテーブルのrack_idと連携)
    rack_id INT NOT NULL,
    -- 保管されている行列 (例: 1)
    slot_area VARCHAR(10) NOT NULL,
    -- 部品情報 (空のスロットを表現するため、NULLを許容)
    box_id VARCHAR(100) NULL,
    part_name VARCHAR(255) NULL,
    part_model_number VARCHAR(100) NULL,
    -- 部品個数 (空きスロットの場合はデフォルトで0が入る)
    quantity INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    -- カラーコード
    color_code VARCHAR(7) NOT NULL DEFAULT '#CCCCCC',
    -- 【重要】同じ棚の同じ場所に重複して登録できないようにする制約
    UNIQUE (rack_id, slot_area),
    -- 外部キー制約: 存在しない棚IDの登録を防ぐ
    FOREIGN KEY (rack_id) REFERENCES racks(rack_id) ON DELETE CASCADE
);












-- 【racks テーブル（棚マスタ）】
--CREATE TABLE racks (
    --rack_id SERIAL PRIMARY KEY,              -- レコードID（自動連番）
    --rack_name VARCHAR(100) UNIQUE NOT NULL,  -- 棚の名前（例: "A-1棚"）
    --rack_location VARCHAR(255) NOT NULL,     -- 保管場所（例: "第1倉庫 A-1列"）
    --rack_qr_path VARCHAR(255)                -- QRコード画像パス
--);

-- 【parts_inventory テーブル（部品在庫）】
--CREATE TABLE parts_inventory (
    --parts_id SERIAL PRIMARY KEY,                 -- 部品在庫ID（自動連番）
    --parts_rack_id INT NOT NULL,                  -- 棚ID（外部キー）
    --parts_name VARCHAR(100) NOT NULL,            -- 部品名
    --parts_number VARCHAR(100) NOT NULL,          -- 部品型番
    --parts_quantity INT NOT NULL DEFAULT 0,       -- 部品個数
    --parts_qr_path VARCHAR(255),                  -- 出庫用QRコード画像パス
    --parts_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    --FOREIGN KEY (parts_rack_id) REFERENCES racks(rack_id) -- 外部キー制約
--);

