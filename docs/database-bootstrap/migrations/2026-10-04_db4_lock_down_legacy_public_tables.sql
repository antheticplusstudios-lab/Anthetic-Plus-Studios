-- Applied live 2026-10-04. Server-side service_role access remains available.
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.clients, public.contacts, public.teams, public.team_members, public.workflows, public.workflow_executions, public.crm_notes FROM anon, authenticated;
