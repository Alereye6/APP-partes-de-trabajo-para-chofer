1. Abre config.js y pega:
   - SUPABASE_URL
   - SUPABASE_ANON_KEY (Publishable key)

2. En Supabase ejecuta el SQL de supabase_schema.sql.

3. Sube esta carpeta tal cual a Netlify con Deploy manually.

4. Esta versión NO usa Netlify Functions ni variables de entorno.

5. Importante: las tablas funcionan con RLS desactivado (UNRESTRICTED). Si activas RLS, tendrás que crear políticas.
