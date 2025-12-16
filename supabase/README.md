# Supabase Edge Function: aio-ai (Real AI dla GitHub Pages)

Ta strona jest hostowana statycznie na GitHub Pages, więc nie można bezpiecznie trzymać klucza API w kodzie frontendu.
Rozwiązaniem jest Supabase Edge Function, która działa jako „bramka” do AI (OpenAI).

## Wymagania
- Konto Supabase + projekt
- Supabase CLI zainstalowane lokalnie

## Kroki wdrożenia
1. Zaloguj się w CLI:
   ```bash
   supabase login
   ```

2. Połącz projekt (w katalogu repo):
   ```bash
   supabase link --project-ref <TWÓJ_REF>
   ```

3. Ustaw sekret z kluczem OpenAI (NIGDY nie wklejaj klucza do frontendu):
   ```bash
   supabase secrets set OPENAI_API_KEY=sk-...
   ```
   Opcjonalnie ustaw model:
   ```bash
   supabase secrets set AI_MODEL=gpt-4o-mini
   ```

4. Wdróż funkcję:
   ```bash
   supabase functions deploy aio-ai
   ```

## Konfiguracja frontendu
W pliku `script_modern.js` (lub globalnie przed `app_final.js`) ustaw:
- `window.AIO_SITE.supabaseUrl`
- `window.AIO_SITE.supabaseAnonKey`
- (opcjonalnie) `window.AIO_SITE.aiFunctionName = "aio-ai"`

Frontend wywołuje:
`POST {SUPABASE_URL}/functions/v1/aio-ai`

## Uwagi bezpieczeństwa
- Anon Key może być publiczny (to nie jest sekret).
- Sekretem jest OPENAI_API_KEY — jest tylko po stronie Supabase.
