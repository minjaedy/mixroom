-- A receipt belongs to the message and is removed with the customer's chat.
ALTER TABLE messages ADD COLUMN read_at INTEGER;
