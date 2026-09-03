# React + Vite

## Persistent Presets with Supabase

The app uses local browser storage until Supabase environment variables are configured. To enable shared hosted presets:

1. Create a Supabase project.
2. Run this SQL in the Supabase SQL Editor:

```sql
create table presets (
	id uuid primary key default gen_random_uuid(),
	name text not null,
	title text not null,
	category text,
	team_names jsonb not null,
	question text not null,
	drafts jsonb not null,
	created_at timestamptz default now()
);

alter table presets enable row level security;

create policy "Allow public preset access"
on presets
for all
to anon
using (true)
with check (true);
```

3. In Netlify, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under Site configuration > Environment variables.
4. Redeploy the site.

Use the Supabase publishable/anon key in the frontend, never the service-role key. The policy above creates one shared preset library and allows anyone with access to the app to add or delete presets. Add authentication and stricter policies before using this for private data.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is enabled on this template. See [this documentation](https://react.dev/learn/react-compiler) for more information.

Note: This will impact Vite dev & build performances.
You can also try [the experimental native React Compiler support in plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md#rust-react-compiler) by using `compiler: true` in the plugin options instead of using the Babel plugin.

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
