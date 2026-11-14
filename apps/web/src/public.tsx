import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronLeft, ArrowRight } from 'lucide-react';
import { post, queryClient, setCsrf } from './api';
import { useToast, Field, ErrorState } from './ui';
import type { User } from './types';
export { Landing, Explore, SpotDetails } from './search';
const authSchema = z.object({
  fullName: z.string().optional(),
  email: z.email('Enter a valid email address.'),
  password: z.string().min(10, 'Use at least 10 characters.').max(72),
  owner: z.boolean(),
});
const demoRoles = [
  ['driver', '🚗 Driver Demo'],
  ['owner', '🏠 Host Demo'],
  ['admin', '🛡️ Admin Demo'],
] as const;
export function AuthPage({ register = false }: { register?: boolean }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const form = useForm<z.infer<typeof authSchema>>({
    resolver: zodResolver(authSchema),
    defaultValues: { fullName: '', email: '', password: '', owner: params.get('owner') === 'true' },
  });
  function completeLogin(data: { user: User; csrf: string }, message: string) {
    setCsrf(data.csrf);
    queryClient.clear();
    queryClient.setQueryData(['me'], data.user);
    const next = params.get('next');
    navigate(
      next?.startsWith('/') && !next.startsWith('//')
        ? next
        : data.user.roles.includes('ADMIN')
          ? '/admin'
          : data.user.roles.includes('OWNER')
            ? '/owner'
            : '/',
    );
    toast(message);
  }
  const mutation = useMutation({
    mutationFn: async (values: z.infer<typeof authSchema>) => {
      if (register && (!values.fullName || values.fullName.trim().length < 2))
        throw new Error('Enter your full name.');
      return post<{ user: User; csrf: string }>(
        register ? '/auth/register' : '/auth/login',
        register ? values : { email: values.email, password: values.password },
      );
    },
    onSuccess: (data) =>
      completeLogin(data, register ? 'Welcome to the neighborhood.' : 'Welcome back.'),
  });
  const demoMutation = useMutation({
    mutationFn: (role: (typeof demoRoles)[number][0]) =>
      post<{ user: User; csrf: string }>('/auth/demo-login', { role }),
    onSuccess: (data) =>
      completeLogin(
        data,
        data.user.showcase ? 'Opened restricted admin demonstration.' : 'Welcome back.',
      ),
  });
  const busy = mutation.isPending || demoMutation.isPending;
  const authError = mutation.error ?? demoMutation.error;
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <span className="eyebrow">A LITTLE SPACE. A BETTER CITY.</span>
        <h1>
          Good parking.
          <br />
          <em>Great neighbors.</em>
        </h1>
        <img src="/demo/hero-neighborhood.svg" alt="A quiet illustrated neighborhood" />
        <p>Thoughtful spaces, shared by people nearby.</p>
      </section>
      <section className="auth-form">
        <Link className="back-link" to="/">
          <ChevronLeft size={16} />
          Back to DriveShare
        </Link>
        <h1>{register ? 'Make room for a better day.' : 'Good to see you again.'}</h1>
        <p className="muted">
          {register
            ? 'One account to park and share your space.'
            : 'Your next little space is waiting.'}
        </p>
        <form onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
          {register && (
            <Field label="Full name" error={form.formState.errors.fullName?.message}>
              <input autoComplete="name" {...form.register('fullName')} />
            </Field>
          )}
          <Field label="Email address" error={form.formState.errors.email?.message}>
            <input type="email" autoComplete="email" {...form.register('email')} />
          </Field>
          <Field label="Password" error={form.formState.errors.password?.message}>
            <input
              type="password"
              autoComplete={register ? 'new-password' : 'current-password'}
              {...form.register('password')}
            />
          </Field>
          {register && (
            <label className="checkbox">
              <input type="checkbox" {...form.register('owner')} />
              I’d also like to host a parking space
            </label>
          )}
          {authError && <ErrorState error={authError} />}
          <button className="btn btn-full" disabled={busy}>
            {busy ? 'Just a moment…' : register ? 'Create your account' : 'Sign in'}
            <ArrowRight size={17} />
          </button>
        </form>
        <p className="small">
          {register ? 'Already a neighbor?' : 'New around here?'}{' '}
          <Link className="text-teal" to={register ? '/login' : '/register'}>
            {register ? 'Sign in' : 'Create an account'}
          </Link>
        </p>
        {!register && (
          <div className="soft-card demo-credentials" data-testid="demo-login-panel">
            <strong>Take a look around</strong>
            <p>One-click demonstration access for Sahyadri campus driver, host and admin flows</p>
            <div className="button-row">
              {demoRoles.map(([role, title]) => (
                <button
                  className="btn btn-outline btn-sm"
                  type="button"
                  key={role}
                  disabled={busy}
                  onClick={() => demoMutation.mutate(role)}
                >
                  {title}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
