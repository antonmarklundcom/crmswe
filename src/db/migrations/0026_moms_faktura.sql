-- Moms & faktura engine (plan.md §5.2): the two things the moms columns from
-- migration 0025 turned out to still be missing before a faktura is legally
-- complete.
--
-- 1. A buyer address. Mervärdesskattelagen requires the buyer's name *and*
--    address on the invoice, and `contacts` had nowhere to hold one. Split
--    into fields rather than one text block so the PEPPOL BIS export in the
--    backlog has something structured to map (plan.md §10).
--
-- 2. Party snapshots on the document. Same reasoning as `vat_summary` in
--    0025: an issued faktura is a record kept for seven years, so the buyer
--    and seller details printed on it are frozen onto the row when it is
--    issued. Otherwise a customer changing address, or a tenant changing
--    bankgiro, silently rewrites every invoice already sent.
--
-- Everything here is additive and nullable. No existing row changes meaning,
-- and no amount is rewritten.

-- Faktureringsadress on contacts (plan.md §5.2.3).
ALTER TABLE `contacts` ADD `address_line1` varchar(200);
--> statement-breakpoint
ALTER TABLE `contacts` ADD `address_line2` varchar(200);
--> statement-breakpoint
ALTER TABLE `contacts` ADD `postal_code` varchar(16);
--> statement-breakpoint
ALTER TABLE `contacts` ADD `city` varchar(100);
--> statement-breakpoint
ALTER TABLE `contacts` ADD `country` char(2);
--> statement-breakpoint

-- Parties as printed, frozen at issue (plan.md §5.2.3, §5.2.5).
ALTER TABLE `documents` ADD `buyer_snapshot` json;
--> statement-breakpoint
ALTER TABLE `documents` ADD `seller_snapshot` json;
