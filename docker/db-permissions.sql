-- The image creates the account first. Runtime code cannot alter the schema.
REVOKE ALL PRIVILEGES ON myenvelope.* FROM 'myenvelope_app'@'%';
GRANT SELECT, INSERT ON myenvelope.User TO 'myenvelope_app'@'%';
GRANT SELECT, INSERT ON myenvelope.Expenses TO 'myenvelope_app'@'%';
GRANT SELECT, INSERT ON myenvelope.Earnings TO 'myenvelope_app'@'%';
GRANT SELECT, INSERT, UPDATE ON myenvelope.Planning TO 'myenvelope_app'@'%';
