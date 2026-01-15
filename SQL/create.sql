/* =========================================================
   MATERIO システム データベース定義書 (詳細コメント付)
   ========================================================= */

/* ---------------------------------------------------------
   1. マスタ関連 (権限, ライン, 従業員, 機械, 優先度)
   --------------------------------------------------------- */

-- 【権限マスタ】
CREATE TABLE roles (
    role_id SERIAL PRIMARY KEY,            -- 権限ID (自動採番、主キー)
    role_name VARCHAR(50) UNIQUE NOT NULL, -- 権限名 (例: "管理者", "作業員" / 重複不可)
    is_admin BOOLEAN NOT NULL DEFAULT FALSE -- 管理者権限フラグ (TRUE=管理者機能にアクセス可)
);

-- 【生産ラインマスタ】
CREATE TABLE production_lines (
    line_id SERIAL PRIMARY KEY,            -- ラインID (自動採番、主キー)
    line_name VARCHAR(100) UNIQUE NOT NULL -- ライン名称 (例: "ラインA", "ラインB")
);

-- 【従業員テーブル】
CREATE TABLE employees (
    employee_id SERIAL PRIMARY KEY,                     -- 従業員ID (自動採番、主キー)
    employee_name VARCHAR(100) NOT NULL,                -- 氏名 (フルネーム)
    employee_user_id VARCHAR(50) UNIQUE NOT NULL,       -- ログイン用ID (システム内で一意)
    employee_password VARCHAR(255) NOT NULL,            -- ログインパスワード (暗号化推奨)
    employee_is_active BOOLEAN DEFAULT TRUE,            -- アカウント有効状態 (TRUE=有効、FALSE=無効)
    employee_role_id INT NOT NULL,                      -- 権限ID (FK: rolesテーブル参照)
    employee_line_id INT NOT NULL,                      -- 所属ラインID (FK: production_linesテーブル参照)
    employee_special_notes TEXT,                        -- 特記事項・メモ
    employee_color_code CHAR(6),                        -- 表示用カラーコード (例: FF0000)
    FOREIGN KEY (employee_role_id) REFERENCES roles(role_id),
    FOREIGN KEY (employee_line_id) REFERENCES production_lines(line_id)
);

-- 【優先度マスタ】
CREATE TABLE priorities (
    priority_id SERIAL PRIMARY KEY,            -- 優先度ID (自動採番)
    priority_label VARCHAR(20) UNIQUE NOT NULL -- 優先度ラベル (例: "至急", "通常")
);

-- 【機械マスタ】
CREATE TABLE machines (
    machine_id SERIAL PRIMARY KEY,             -- 機械ID (自動採番)
    machine_name VARCHAR(100) UNIQUE NOT NULL  -- 機械名称 (一意)
);


/* ---------------------------------------------------------
   2. 機械・生産状況管理 (ステータス, ログ)
   --------------------------------------------------------- */

-- 【機械ステータス状況】
CREATE TABLE machine_status (
    machine_status_id SERIAL PRIMARY KEY,                -- ステータスID (主キー)
    machine_data_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- データ記録日時 (デフォルト:現在時刻)
    machine_id INT NOT NULL,                             -- 対象機械ID (machinesテーブルと連携想定)
    machine_start_time TIMESTAMP NULL,                   -- 稼働開始時刻
    today_production_count INT DEFAULT 0,                -- 本日の生産数 (0からスタート)
    machine_last_inspection DATE,                        -- 最終点検日
    inspection_interval_days INT DEFAULT 90 NOT NULL     -- 次回点検までの間隔日数 (デフォルト90日)
);

-- 【機械エラーログ】
CREATE TABLE machine_logs (
    log_id SERIAL PRIMARY KEY,                                           -- ログID
    machine_name VARCHAR(100) NOT NULL,                                  -- 発生した機械名
    unit_id INT NULL,                                                    -- ユニットID (特定できる場合)
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,                       -- エラー発生時刻
    log_type VARCHAR(10) CHECK (log_type IN ('error','warning','info')), -- ログ種別 (エラー/警告/情報 に限定)
    title VARCHAR(100) NOT NULL,                                         -- ログのタイトル・概要
    message TEXT                                                         -- 詳細メッセージ内容
);


/* ---------------------------------------------------------
   3. 画像検査システム (ロット, ショット, セクション)
   --------------------------------------------------------- */

-- 【検査セクションマスタ】
CREATE TABLE inspection_sections (
    section_id SERIAL PRIMARY KEY,         -- セクションID
    section_code VARCHAR(32) UNIQUE NOT NULL, -- 内部識別コード (例: spring, alayer)
    section_name VARCHAR(64) NOT NULL      -- 表示用セクション名 (例: バネ検査, A層検査)
);

-- 【検査ロット】
CREATE TABLE inspection_lots (
    id BIGSERIAL PRIMARY KEY,                      -- ロット管理ID (主キー)
    lot_id VARCHAR(64) NOT NULL UNIQUE,            -- 製品ロット番号 (バーコード値など、一意)
    section_code VARCHAR(32) NOT NULL,             -- 検査セクションコード
    captured_at TIMESTAMP WITH TIME ZONE NOT NULL  -- 検査実施日時
);

-- 【検査カメラショット詳細】
CREATE TABLE inspection_camera_shots (
    id BIGSERIAL PRIMARY KEY,                                                -- ショットID
    lot_id_ref BIGINT NOT NULL,                                              -- 所属ロットID (FK: inspection_lots参照)
    camera_id VARCHAR(64) NOT NULL,                                          -- カメラ識別ID (例: cam_01)
    c4k_seq VARCHAR(32) NULL,                                                -- 4Kカメラ画像シーケンス番号
    fhd_seq VARCHAR(32) NULL,                                                -- FHDカメラ画像シーケンス番号
    shot_seq INT NULL,                                                       -- カメラ内連番 (1, 2...)
    status VARCHAR(16) NOT NULL CHECK (status IN ('PASS','FAIL','MISSING')), -- 判定結果 (良/否/欠損 に限定)
    details TEXT NULL,                                                       -- 不良理由などの詳細 (PASS時はNULL)
    image_path TEXT NULL,                                                    -- 画像ファイルへのパス
    captured_at TIMESTAMP WITH TIME ZONE NULL,                               -- 撮影日時
    FOREIGN KEY (lot_id_ref) REFERENCES inspection_lots(id) ON DELETE CASCADE -- ロット削除時に紐づく画像データも削除
);


/* ---------------------------------------------------------
   4. 業務報告・通知 (日報, 生産報告, 通知)
   --------------------------------------------------------- */

-- 【生産目標通知】
CREATE TABLE notifications (
    notification_id SERIAL PRIMARY KEY,                          -- 通知ID
    notification_data_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,  -- 通知作成日時
    notification_line_id INT NOT NULL,                           -- 対象ラインID (FK)
    notification_quantity INT NOT NULL,                          -- 目標生産数
    notification_item_name VARCHAR(50),                          -- 品目名
    notification_item_size VARCHAR(50),                          -- サイズ規格
    notification_color VARCHAR(50),                              -- 色指定
    notification_spring_type VARCHAR(50),                        -- バネ種別
    notification_accessories VARCHAR(50),                        -- 付属品
    notification_delivery_method VARCHAR(50),                    -- 納品方法
    notification_delivery_address VARCHAR(100),                  -- 納品先住所
    notification_delivery_company VARCHAR(50),                   -- 納品先会社名
    notification_remarks TEXT,                                   -- 備考・特記事項
    notification_priority_id INT NOT NULL,                       -- 優先度ID (FK)
    is_completed BOOLEAN NOT NULL DEFAULT false,                 -- 完了フラグ (未完了=false)
    FOREIGN KEY (notification_line_id) REFERENCES production_lines(line_id),
    FOREIGN KEY (notification_priority_id) REFERENCES priorities(priority_id)
);

-- 【生産報告書（数量実績）】
CREATE TABLE production_reports (
    prodreport_id SERIAL PRIMARY KEY,              -- 報告ID
    prodreport_date DATE NOT NULL,                 -- 対象日付
    prodreport_product_name VARCHAR(100) NOT NULL, -- 製造した製品名
    prodreport_plan_quantity INT NOT NULL,         -- 計画数
    prodreport_actual_quantity INT NOT NULL,       -- 実績数 (製造できた数)
    prodreport_achievement_rate DECIMAL(5,2),      -- 達成率 (例: 98.50%)
    prodreport_defective_quantity INT NOT NULL,    -- 不良品数
    prodreport_employee_id INT,                    -- 報告担当者ID (FK)
    prodreport_remarks TEXT,                       -- 報告備考
    FOREIGN KEY (prodreport_employee_id) REFERENCES employees(employee_id)
);

-- 【業務日報（テキスト詳細）】
CREATE TABLE daily_reports (
    report_id SERIAL PRIMARY KEY,                   -- 日報ID
    employee_id INT NOT NULL,                       -- 作成者ID (FK)
    line_id INT NOT NULL,                           -- 所属ラインID (FK)
    report_date DATE NOT NULL,                      -- 日報対象日
    notes TEXT,                                     -- 日報本文 (作業内容や所感)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- 作成日時 (自動入力)
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- 更新日時 (自動入力)
    FOREIGN KEY (employee_id) REFERENCES employees (employee_id),
    FOREIGN KEY (line_id) REFERENCES production_lines (line_id)
);

-- 【今日のお知らせ】
CREATE TABLE today_message (
    message_id INT PRIMARY KEY DEFAULT 1,          -- ID (常に1つのレコードを更新して使用)
    content TEXT,                                  -- お知らせ本文
    priority INT DEFAULT 1,                        -- 重要度レベル (1:低 ～ 3:高)
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP -- 最終更新日時
);


/* ---------------------------------------------------------
   5. 在庫管理 (棚, 部品スロット)
   --------------------------------------------------------- */

-- 【棚情報】
CREATE TABLE racks (
    rack_id SERIAL PRIMARY KEY,             -- 棚ID
    rack_name VARCHAR(255) NOT NULL UNIQUE, -- 棚の名称 (重複不可)
    rows INT NOT NULL CHECK (rows > 0),     -- 棚の行数 (1以上必須)
    cols INT NOT NULL CHECK (cols > 0)      -- 棚の列数 (1以上必須)
);

-- 【部品スロット情報】
CREATE TABLE slots (
    slot_id SERIAL PRIMARY KEY,                                       -- スロットID
    rack_id INT NOT NULL,                                             -- 所属する棚ID (FK)
    slot_identifier VARCHAR(10) NOT NULL,                             -- 位置識別子 (例: "A-1")
    part_name VARCHAR(255),                                           -- 格納されている部品名
    part_model_number VARCHAR(100),                                   -- 部品型番
    quantity INT CHECK (quantity >= 0),                               -- 現在の在庫数 (0以上)
    color_code VARCHAR(7),                                            -- 管理用カラー
    UNIQUE (rack_id, slot_identifier),                                -- 同一棚内の同じ位置は重複不可
    FOREIGN KEY (rack_id) REFERENCES racks(rack_id) ON DELETE CASCADE -- 棚が削除されたらスロットも削除
);