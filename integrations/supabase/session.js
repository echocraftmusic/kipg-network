function client() {
  if (!window.ecSupabase) throw new Error("Supabase is not configured.");
  return window.ecSupabase;
}

export async function getSession() {
  const { data, error } = await client().auth.getSession();
  if (error) throw error;
  return data.session ?? null;
}

export async function requireSession({ redirectTo = "login.html" } = {}) {
  const session = await getSession();
  if (!session) {
    location.replace(redirectTo);
    return null;
  }
  return session;
}

export async function sendMagicLink(email, redirectTo) {
  const { error } = await client().auth.signInWithOtp({
    email: String(email).trim().toLowerCase(),
    options: { emailRedirectTo: redirectTo },
  });
  if (error) throw error;
}

export async function signOut({ redirectTo = "login.html" } = {}) {
  const { error } = await client().auth.signOut();
  if (error) throw error;
  location.replace(redirectTo);
}

