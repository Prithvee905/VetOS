-- Send the pet's vaccination card PDF on WhatsApp after vaccines are recorded.
-- Off by default: it needs the approved Meta template "vaccination_card" (document header).
ALTER TABLE clinics ADD COLUMN IF NOT EXISTS send_vaccination_card boolean NOT NULL DEFAULT false;
