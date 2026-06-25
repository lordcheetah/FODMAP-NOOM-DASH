-- Phase 3: barcode column on foods for scanned-product caching + per-user dedup.
--
-- A scanned product becomes a normal user-custom food row (user_id = auth.uid(),
-- barcode set) so it flows through the existing search / log / roll-up / summary
-- code unchanged. No new table, and NO RLS change: the existing 0001 policies
-- (foods_insert `with check (user_id = auth.uid())`, foods_read `using (true)`,
-- foods_update / foods_delete gated on `user_id = auth.uid()`) already permit an
-- authed user to insert/read their own barcode-tagged food and forbid forging
-- someone else's user_id.

alter table foods add column if not exists barcode text;

-- Lookup index for "find my food by barcode".
create index if not exists foods_barcode_idx on foods (barcode);

-- Per-user dedup: a user keeps at most one custom food per barcode. Partial
-- (where barcode is not null) so the many rows without a barcode (global seed +
-- manually-typed customs) stay unconstrained — mirrors the 0002/0004 partial-index
-- style. For global seed rows user_id is null, so nulls never collide; scanned
-- rows always carry a non-null user_id, making dedup exact per user.
create unique index if not exists foods_user_barcode_key_idx
  on foods (user_id, barcode)
  where barcode is not null;
