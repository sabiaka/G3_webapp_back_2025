-- DELETEと同様、順番に実行します
TRUNCATE TABLE 
    reports,
    notifications,
    machine_status,
    production_reports,
    parts_inventory,
    inspection_results,
    machine_production,
    employees,
    machines,
    racks,
    roles,
    production_lines,
    priorities
RESTART IDENTITY; -- PostgreSQLの場合、このオプションで自動採番IDもリセット