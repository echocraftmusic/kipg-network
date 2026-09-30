import { requireSession } from "./session.js";

export async function requireApprovedAdmin({
  redirectTo = "login.html",
  allowedRoles = ["admin"],
} = {}) {
  const session = await requireSession({ redirectTo });
  if (!session) return null;

  const { data: profile, error } = await window.ecSupabase
    .from("profiles")
    .select("id, full_name, email, role, status")
    .eq("id", session.user.id)
    .maybeSingle();

  const approved = !error && profile?.status === "approved" && allowedRoles.includes(profile.role);
  if (!approved) {
    await window.ecSupabase.auth.signOut();
    location.replace(redirectTo);
    return null;
  }

  window.ecAdmin = Object.freeze(profile);
  window.EC?.events.emit("ec:admin-ready", { profile });
  return profile;
}

