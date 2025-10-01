import { Pool } from 'pg';
import { networkInterfaces } from 'os';

// サーバーのネットワークIPを取得して環境を判定
function getEnvironmentByNetwork() {
  const interfaces = networkInterfaces();
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // IPv4のみ対象、内部ループバックは除外
      if (iface.family === 'IPv4' && !iface.internal) {
        const ip = iface.address;
        
        // 開発環境のネットワーク判定 (192.168.x.x)
        if (ip.startsWith('192.168.')) {
          return {
            env: 'development',
            serverIp: ip,
            config: {
              user: 'nakamura',
              host: '192.168.0.20',
              database: 'g3db',
              password: 'g3',
              port: 5432,
            }
          };
        }
        
        // 本番環境のネットワーク判定 (10.x.x.x)
        if (ip.startsWith('10.')) {
          return {
            env: 'production',
            serverIp: ip,
            config: {
              user: 'nakamura',
              host: '10.100.54.170',
              database: 'g3db',
              password: 'g3',
              port: 5432,
            }
          };
        }
      }
    }
  }
  
  // デフォルト（判定不可の場合は本番設定）
  return {
    env: 'unknown',
    serverIp: 'unknown',
    config: {
      user: 'nakamura',
      host: '10.100.54.170',
      database: 'g3db',
      password: 'g3',
      port: 5432,
    }
  };
}

const networkEnv = getEnvironmentByNetwork();
console.log(`[DB] Network environment detected: ${networkEnv.env} (Server IP: ${networkEnv.serverIp}) → DB: ${networkEnv.config.host}`);

const pool = new Pool(networkEnv.config);

// すべての接続でタイムゾーンをJSTに固定（CURRENT_TIMESTAMPや型変換の基準をJSTへ）
pool.on('connect', (client) => {
  client.query("SET TIME ZONE 'Asia/Tokyo'").catch((e) => {
    console.error('[DB] Failed to set session time zone to Asia/Tokyo:', e);
  });
});

export default {
  query: (text, params) => pool.query(text, params),
};