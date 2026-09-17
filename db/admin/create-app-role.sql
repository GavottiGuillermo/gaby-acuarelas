-- Ejecutar interactivamente con el usuario administrador de la base.
-- \password solicita la clave sin guardarla en este archivo.
CREATE ROLE gaby_acuarelas_app
  LOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOINHERIT
  NOREPLICATION
  CONNECTION LIMIT 5;

\password gaby_acuarelas_app

