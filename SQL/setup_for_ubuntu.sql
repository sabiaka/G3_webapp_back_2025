-- setup_for_ubuntu.sql
-- Ubuntu上で本プロジェクト用のPostgreSQL環境を準備します。
-- 目的: ユーザー nakamura / パスワード g3、データベース g3db を作成し、
--       タイムゾーン等の基本設定、スキーマ・権限付与、スキーマ/テストデータ投入を行う。
-- 実行方法(リポジトリのルートで実行):
--   sudo -u postgres psql -f SQL/setup_for_ubuntu.sql
-- 事前条件: PostgreSQL がインストール済みで、postgresユーザーで psql を実行できること。

\set ON_ERROR_STOP on
SET client_min_messages TO WARNING;

\echo '== 1) ロール(nakamura)の作成/更新'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'nakamura'
  ) THEN
    -- ログイン可能なユーザー作成
    CREATE ROLE nakamura LOGIN PASSWORD 'g3';
  ELSE
    -- 既存の場合はパスワード等を更新
    ALTER ROLE nakamura WITH LOGIN PASSWORD 'g3';
  END IF;
END $$;

\echo '== 2) データベース(g3db)の作成 (存在しなければ)'
-- CREATE DATABASE はトランザクション外で実行する必要があるため、\gexec を使用
SELECT 'CREATE DATABASE g3db OWNER nakamura TEMPLATE template0 ENCODING ''UTF8''' 
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'g3db')\gexec

\echo '== 3) データベースの基本設定(タイムゾーン)'
ALTER DATABASE g3db SET timezone TO 'Asia/Tokyo';

\echo '== 4) g3db に接続'
\connect g3db

\echo '== 5) public スキーマの所有者/権限設定'
ALTER SCHEMA public OWNER TO nakamura;
GRANT USAGE, CREATE ON SCHEMA public TO nakamura;
-- 既存オブジェクトに対する権限
GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public TO nakamura;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO nakamura;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO nakamura;
-- 以後作成されるオブジェクトのデフォルト権限
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO nakamura;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO nakamura;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO nakamura;

\echo '== 6) スキーマ作成(SQL/create.sql)の読み込み'
\i SQL/create.sql

\echo '== 7) テストデータ(SQL/testdata.sql)の読み込み(任意)'
-- 必要に応じてコメント解除して実行
\i SQL/testdata.sql

\echo '== 完了: Ubuntu向けDBセットアップが正常に終了しました'

-- 補足: リモートからの接続が必要な場合は、PostgreSQL設定も必要です。
--   - /etc/postgresql/<version>/main/postgresql.conf の listen_addresses を '*' へ
--   - /etc/postgresql/<version>/main/pg_hba.conf に接続元の許可行を追加 (例: host all all 192.168.0.0/16 md5)
--   - その後、sudo systemctl restart postgresql
--   これらはSQLでは設定できないため、OS側の設定で対応してください。