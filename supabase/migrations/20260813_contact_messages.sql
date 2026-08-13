CREATE TABLE IF NOT EXISTS public.contact_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    subject TEXT,
    message TEXT NOT NULL,
    status TEXT DEFAULT 'unread',
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anonymous insert on contact_messages" ON public.contact_messages;
CREATE POLICY "Allow anonymous insert on contact_messages" ON public.contact_messages
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow admins to manage contact_messages" ON public.contact_messages;
CREATE POLICY "Allow admins to manage contact_messages" ON public.contact_messages
    FOR ALL USING (
        auth.uid() IN (
            SELECT user_id FROM public.user_roles WHERE role IN ('admin', 'super_admin')
        )
    );
