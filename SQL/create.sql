-- 【Role (権限) マスタ化】
CREATE TABLE roles (
    role_id SERIAL PRIMARY KEY,            -- 自動採番
    role_name VARCHAR(50) UNIQUE NOT NULL,  -- 権限名(例:"管理者"や"一般")
    is_admin BOOLEAN NOT NULL DEFAULT FALSE --追加 09/25
);

-- 【Production Line (担当ライン) マスタ化】
CREATE TABLE production_lines (
    line_id SERIAL PRIMARY KEY,            -- 自動採番
    line_name VARCHAR(100) UNIQUE NOT NULL -- ライン名(例:"ラインA"や"ラインB")
);

-- 【employees(従業員リスト)】(2025/09/26 修正)
CREATE TABLE employees (
    employee_id SERIAL PRIMARY KEY,                     -- 自動採番
    employee_name VARCHAR(100) NOT NULL,                -- 名前（フルネーム）
    employee_user_id VARCHAR(50) UNIQUE NOT NULL,       -- ユーザーID（ログイン用、一意）
    employee_password VARCHAR(255) NOT NULL,            -- パスワード（ハッシュ保存推奨）
    employee_is_active BOOLEAN DEFAULT TRUE,            -- 有効/無効フラグ（TRUE=有効）
    employee_role_id INT NOT NULL,                      -- 権限ID
    employee_line_id INT NOT NULL,                      -- 担当ラインID
    employee_special_notes TEXT,                        -- 特記事項（メモなど）
    employee_color_code CHAR(6),                        -- カラーコード (例:"FF0000")
    FOREIGN KEY (employee_role_id) REFERENCES roles(role_id),
    FOREIGN KEY (employee_line_id) REFERENCES production_lines(line_id)
);

-- 【Reports(日報)】
CREATE TABLE reports (
    report_id SERIAL PRIMARY KEY,            -- 自動採番
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
    notification_id SERIAL PRIMARY KEY,
    notification_data_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notification_line_id INT NOT NULL,
    notification_quantity INT NOT NULL,
    notification_item_name VARCHAR(50),
    notification_item_size VARCHAR(50),
    notification_color VARCHAR(50),
    notification_spring_type VARCHAR(50),
    notification_accessories VARCHAR(50),
    notification_delivery_method VARCHAR(50),
    notification_delivery_address VARCHAR(100),
    notification_delivery_company VARCHAR(50),
    notification_remarks TEXT,
    notification_priority_id INT NOT NULL,
    is_completed BOOLEAN NOT NULL DEFAULT false,
    FOREIGN KEY (notification_line_id) REFERENCES production_lines(line_id),
    FOREIGN KEY (notification_priority_id) REFERENCES priorities(priority_id)
);

-- 【Machine Name(機械名)マスタ化】
CREATE TABLE machines (
    machine_id SERIAL PRIMARY KEY,             -- 機械ID（自動採番）
    machine_name VARCHAR(100) UNIQUE NOT NULL  -- 機械名（例: "生産機Mk-I"）
);

-- 【Machine Status(機械状況)】
CREATE TABLE machine_status (
    machine_status_id SERIAL PRIMARY KEY,                        -- 主キー
    machine_data_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,       -- 状態記録時刻
    machine_id INT NOT NULL,                                     -- 対象機械ID（machines.machine_id）
    machine_start_time TIMESTAMP NULL,                           -- 機械の起動時刻（稼働開始のタイムスタンプ）
    today_production_count INT DEFAULT 0,                        -- 今日の累計生産数
    machine_last_inspection DATE,                                -- 最終点検日
    inspection_interval_days INT DEFAULT 90 NOT NULL             -- 点検間隔（日数）
    -- ,FOREIGN KEY (machine_id) REFERENCES machines(machine_id) -- 必要なら制約を有効化
);

-- 【Machine logs(エラーログ)】
CREATE TABLE machine_logs (
    log_id SERIAL PRIMARY KEY,                                           -- ログID
    machine_name VARCHAR(100) NOT NULL,                                  -- 対象機械NAME
    unit_id INT NULL,                                                    -- 対象ユニットID (任意)
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,                       -- 発生時刻
    log_type VARCHAR(10) CHECK (log_type IN ('error','warning','info')), -- 種別
    title VARCHAR(100) NOT NULL,                                         -- ログタイトル（コード + 概要）
    message TEXT                                                         -- 詳細メッセージ
);

--【画像検査テーブル】
--CREATE TABLE inspection_results (
--    inspection_id SERIAL PRIMARY KEY,                                   -- 自動採番
--    inspection_camera_id VARCHAR(50) NOT NULL,                          -- カメラ名
--    inspection_product_id VARCHAR(50) NOT NULL,                         -- 製品名
--    inspection_result VARCHAR(50) NULL,                                 -- 検査結果（良品、不良など）
--    inspection_reason TEXT NULL,                                        -- 問題点詳細
--    inspection_image_path TEXT NOT NULL,                                -- 検査画像パス
--    inspection_captured_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,       -- 撮影日時
--    inspection_inspected_time TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP  -- 検査日時
--);




-- セクションの正規化（任意）
CREATE TABLE inspection_sections (
    section_id SERIAL PRIMARY KEY,                       -- セクションID（内部連番）
    section_code VARCHAR(32) UNIQUE NOT NULL,            -- セクション内部コード（例: 'spring', 'alayer'）
    section_name VARCHAR(64) NOT NULL                    -- セクション表示名（例: 'バネ留め', 'A層検査'）
);

-- ロット（製品ID等に相当）
CREATE TABLE inspection_lots (
    id BIGSERIAL PRIMARY KEY,                                       -- ロット内部ID（連番）
    lot_id VARCHAR(64) NOT NULL,                                    -- ロットID（製品ID等、例: 'MAT-10001'）
    section_code VARCHAR(32) NOT NULL,                              -- セクション内部コード（例: 'spring'）
    captured_at TIMESTAMP WITH TIME ZONE NOT NULL,                  -- 検査代表時刻（最初/最後のいずれか）
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,  -- レコード作成日時
    UNIQUE (lot_id)                                                 -- ロットIDは一意
);

-- カメラショット（1ロット内で複数可、同一camera_idで複数行OK）
CREATE TABLE inspection_camera_shots (
    id BIGSERIAL PRIMARY KEY,                                                   -- ショット内部ID（連番）
    lot_id_ref BIGINT NOT NULL REFERENCES inspection_lots(id) ON DELETE CASCADE,-- ロット参照ID
    camera_id VARCHAR(64) NOT NULL,                                             -- カメラID（例: 'B-spring01', 'A-main01'）
    status VARCHAR(16) NOT NULL CHECK (status IN ('PASS','FAIL','MISSING')),    -- 判定ステータス
    details TEXT NULL,                                                          -- 不良理由等（PASS時はNULL推奨）
    image_path TEXT NULL,                                                       -- 画像パス（MISSING時はNULL可）
    shot_seq INT NOT NULL DEFAULT 1,                                            -- 同一カメラ内の通番（1..n）
    captured_at TIMESTAMP WITH TIME ZONE NULL                                   -- ショット撮影時刻
);








--【生産個数管理テーブル】
CREATE TABLE machine_production (
    production_id SERIAL PRIMARY KEY,
    machine_id INT NOT NULL,-- ★ VARCHARからINT(整数)型に変更
    product_id INT NOT NULL,
    production_count INT NOT NULL,
    captured_time TIMESTAMP NOT NULL,
    FOREIGN KEY (machine_id) REFERENCES machines(machine_id)-- ★ machinesテーブルのmachine_idと連携させる設定（外部キー）
);

-- 【生産数管理テーブル】
CREATE TABLE production_reports (
    prodreport_id SERIAL PRIMARY KEY,              -- 自動採番
    prodreport_date DATE NOT NULL,                 -- 日付
    prodreport_product_name VARCHAR(100) NOT NULL, -- 製品名
    prodreport_plan_quantity INT NOT NULL,         -- 計画数量
    prodreport_actual_quantity INT NOT NULL,       -- 実績数量
    prodreport_achievement_rate DECIMAL(5,2),      -- 達成率（例: 95.00）
    prodreport_defective_quantity INT NOT NULL,    -- 不良数
    prodreport_employee_id INT,                    -- 担当者ID
    prodreport_remarks TEXT,                       -- 備考
    FOREIGN KEY (prodreport_employee_id) REFERENCES employees(employee_id)
);

--【部品在庫管理(棚ver)テーブル】
CREATE TABLE racks (
    rack_id SERIAL PRIMARY KEY,             -- 棚のID、自動で番号が振られる
    rack_name VARCHAR(255) NOT NULL UNIQUE, -- 棚の名前 (例: スプリング・小物資材ラック)
    rows INT NOT NULL CHECK (rows > 0),     -- 棚の行数 (1, 2, 3...)
    cols INT NOT NULL CHECK (cols > 0)      -- 棚の列数 (1, 2, 3...)
);

--【部品在庫管理(部品情報ver)テーブル】
CREATE TABLE slots (
    slot_id SERIAL PRIMARY KEY,                                       -- スロットのID、これも自動
    rack_id INT NOT NULL,                                             -- どの棚に属してるかのID
    slot_identifier VARCHAR(10) NOT NULL,                             -- 場所を示す識別子 (例: 'A-1', 'C-4')
    part_name VARCHAR(255),                                           -- ↓部品が入ってるときだけ値が入る↓
    part_model_number VARCHAR(100),
    quantity INT CHECK (quantity >= 0),
    color_code VARCHAR(7),
    UNIQUE (rack_id, slot_identifier),                                -- 同じ棚の同じ場所に2個は置けないようにする設定
    FOREIGN KEY (rack_id) REFERENCES racks(rack_id) ON DELETE CASCADE -- 存在しない棚には部品を置けないようにする設定
);









--以下廃棄？--

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