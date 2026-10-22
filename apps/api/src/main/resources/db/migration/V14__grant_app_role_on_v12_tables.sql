-- V12 created these tables but never granted the application role access to them.
GRANT SELECT, INSERT, UPDATE, DELETE ON
    in_app_notifications,
    payment_refunds,
    marketing_campaigns,
    marketing_campaign_deliveries,
    offline_sync_batches,
    offline_sync_mutations
    TO vetos_app;

-- Tables created by later migrations are readable and writable by the app role by default.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO vetos_app;
