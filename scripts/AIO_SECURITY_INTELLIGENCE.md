# AIO Security Intelligence V1

## Migracja przed pierwszym audytem

Najpierw Preview:

    npx wrangler d1 execute aio-community-test --remote --file=scripts/aio-security-intelligence-v1.sql

Po sprawdzeniu Preview, produkcja:

    npx wrangler d1 execute aio-community --remote --file=scripts/aio-security-intelligence-v1.sql

Migracja tworzy tylko dwie tabele raportow i przegladow.
Nie zmienia kont ani blokad.
Nie uruchamiac audytu przed przygotowaniem jego bazy.
