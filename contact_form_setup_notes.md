# Contact Form setup notes

- Supabase project: noor-backend (`llicfiepatzgllmjhzbw`), SQL Editor accessed after user login.
- Initial SQL input produced extra auto-closing parentheses and failed with PostgreSQL syntax error 42601 near `)`.
- The malformed query was replaced directly in the Monaco model with the corrected 881-character SQL.
- Corrected SQL creates `public.contact_messages` with UUID id, name, email, subject, message, status, created_at; enables RLS; allows anonymous INSERT; allows admin/super_admin management through user_roles.
- User explicitly confirmed the destructive-operation warning before executing the query.
- Next action: click Run and verify success, then build/commit/push code.
Supabase execution result: corrected query completed successfully with “Success. No rows returned.” The `contact_messages` table and RLS policies are now live in production.

The implementation now includes the public Contact Form, `/admin/messages` route, and Contact Messages sidebar item. The production build has already passed after fixing a duplicate default export in AdminMessages.tsx.
