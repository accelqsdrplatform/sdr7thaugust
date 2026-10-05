import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function ok(data: unknown) {
  return new Response(JSON.stringify(data), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
}

const ALLOWED_ROLES = ["owner", "sub-admin", "admin"];
const ALLOWED_SIGNUP_DOMAIN = "@accelq.com";

// Compute every user_id that is (directly or indirectly) downline of rootId,
// by walking the reports_to chain. Returns a Set including rootId itself.
function computeDownline(rootId: string, allRows: { user_id: string; reports_to: string | null }[]): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const row of allRows) {
    if (!row.reports_to) continue;
    if (!childrenOf.has(row.reports_to)) childrenOf.set(row.reports_to, []);
    childrenOf.get(row.reports_to)!.push(row.user_id);
  }
  const seen = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const child of childrenOf.get(cur) || []) {
      if (!seen.has(child)) { seen.add(child); queue.push(child); }
    }
  }
  return seen;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    // User client — to verify caller identity and role
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );
    const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const { data: { user } } = await userClient.auth.getUser(token);
    if (!user) return ok({ error: "Unauthorized" });

    // Admin client — needed to list auth.users and bypass RLS on org_hierarchy
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { action } = body;

    // A freshly signed-up user has no org_hierarchy row yet and isn't an
    // admin/sub-admin — handle their own self-service actions before the
    // admin gate below.
    if (action === "self_register") {
      const email = (user.email || "").toLowerCase();
      if (!email.endsWith(ALLOWED_SIGNUP_DOMAIN)) {
        return ok({ error: \`Signups are restricted to \${ALLOWED_SIGNUP_DOMAIN} addresses\` });
      }
      const { data: existing } = await admin.from("org_hierarchy").select("user_id, approved").eq("user_id", user.id).maybeSingle();
      if (existing) {
        return ok({ ok: true, already_registered: true, approved: existing.approved });
      }
      const full_name = (body.full_name || "").trim();
      const { error } = await admin.from("org_hierarchy").insert({
        user_id: user.id,
        full_name,
        role: null,
        region: null,
        reports_to: null,
        approved: false,
      });
      if (error) return ok({ error: error.message });
      return ok({ ok: true });
    }

    if (action === "my_status") {
      const { data: row } = await admin.from("org_hierarchy").select("approved, role").eq("user_id", user.id).maybeSingle();
      return ok({ approved: row?.approved ?? null, role: row?.role ?? null, has_profile: !!row });
    }

    // Verify caller is admin or sub-admin
    const { data: callerRow } = await admin
      .from("org_hierarchy")
      .select("role, user_id, reports_to")
      .eq("user_id", user.id)
      .single();

    if (!callerRow || !['admin', 'sub-admin'].includes(callerRow.role)) {
      return ok({ error: "Forbidden — admins and sub-admins only" });
    }
    const isAdmin = callerRow.role === 'admin';

    // Only a real admin may ask to see the platform "as" someone else (the
    // admin dashboard's View-as feature swaps the client's user/profile, but
    // this edge function always authenticates the real caller — view_as lets
    // an admin faithfully preview a sub-admin's scoped Team Members list
    // without actually weakening anyone's real permissions).
    const viewAsId: string | null = isAdmin && body.view_as ? body.view_as : null;

    // LIST all users (admin) or just caller's own downline (sub-admin)
    if (action === "list_users") {
      const { data: { users }, error } = await admin.auth.admin.listUsers({ perPage: 200 });
      if (error) return ok({ error: error.message });

      const { data: hierarchy } = await admin.from("org_hierarchy").select("*");
      const rows = hierarchy || [];
      const hierarchyMap = Object.fromEntries(rows.map(h => [h.user_id, h]));

      const effectiveId = viewAsId || user.id;
      const effectiveIsAdmin = viewAsId ? hierarchyMap[viewAsId]?.role === 'admin' : isAdmin;
      const effectiveRole = viewAsId ? (hierarchyMap[viewAsId]?.role || null) : callerRow.role;

      let visibleIds: Set<string> | null = null; // null = everyone (admin)
      if (!effectiveIsAdmin) {
        visibleIds = computeDownline(effectiveId, rows);
      }

      const result = users
        .filter(u => !visibleIds || visibleIds.has(u.id))
        .filter(u => hierarchyMap[u.id]?.approved !== false) // pending signups live in list_pending, not here
        .map(u => ({
          id: u.id,
          email: u.email,
          created_at: u.created_at,
          full_name: hierarchyMap[u.id]?.full_name || "",
          role: hierarchyMap[u.id]?.role || null,
          region: hierarchyMap[u.id]?.region || "",
          reports_to: hierarchyMap[u.id]?.reports_to || null,
          has_profile: !!hierarchyMap[u.id],
        }));

      // For the "reports to" picker in the UI: admins can assign anyone as a
      // manager; sub-admins can only pick within their own downline.
      const managerOptions = (effectiveIsAdmin ? users.map(u => u.id) : Array.from(visibleIds || []))
        .map(id => ({ id, full_name: hierarchyMap[id]?.full_name || "", role: hierarchyMap[id]?.role || null }))
        .filter(m => m.role === 'admin' || m.role === 'sub-admin');

      return ok({ users: result, manager_options: managerOptions, caller_role: effectiveRole });
    }

    // LIST pending signups awaiting approval (admin only)
    if (action === "list_pending") {
      if (!isAdmin) return ok({ error: "Forbidden — admins only" });
      const { data: { users }, error } = await admin.auth.admin.listUsers({ perPage: 200 });
      if (error) return ok({ error: error.message });
      const { data: hierarchy } = await admin.from("org_hierarchy").select("*").eq("approved", false);
      const rows = hierarchy || [];
      const usersById = Object.fromEntries(users.map(u => [u.id, u]));
      const result = rows
        .map(h => ({
          id: h.user_id,
          email: usersById[h.user_id]?.email || "",
          full_name: h.full_name || "",
          created_at: usersById[h.user_id]?.created_at || null,
        }))
        .filter(r => r.email); // drop orphaned rows if auth user was removed
      return ok({ pending: result });
    }

    // APPROVE a pending signup (admin only)
    if (action === "approve_user") {
      if (!isAdmin) return ok({ error: "Forbidden — admins only" });
      const { user_id, role, region, reports_to } = body;
      if (!user_id) return ok({ error: "user_id required" });
      if (!role || !ALLOWED_ROLES.includes(role)) return ok({ error: "A valid role is required to approve" });

      const { error } = await admin.from("org_hierarchy").update({
        approved: true,
        role,
        region: region || null,
        reports_to: reports_to || null,
      }).eq("user_id", user_id);
      if (error) return ok({ error: error.message });
      return ok({ ok: true });
    }

    // REJECT a pending signup (admin only) — removes their profile row and
    // their auth account entirely, so a rejected email can sign up again later.
    if (action === "reject_user") {
      if (!isAdmin) return ok({ error: "Forbidden — admins only" });
      const { user_id } = body;
      if (!user_id) return ok({ error: "user_id required" });

      await admin.from("org_hierarchy").delete().eq("user_id", user_id);
      const { error } = await admin.auth.admin.deleteUser(user_id);
      if (error) return ok({ error: error.message });
      return ok({ ok: true });
    }

    // UPDATE a user's profile
    if (action === "update_user") {
      const { user_id, role, full_name, region, reports_to } = body;
      if (!user_id) return ok({ error: "user_id required" });

      const { data: hierarchy } = await admin.from("org_hierarchy").select("user_id, reports_to, role");
      const rows = hierarchy || [];
      const hierarchyMap = Object.fromEntries(rows.map(h => [h.user_id, h]));

      const effectiveId = viewAsId || user.id;
      const effectiveIsAdmin = viewAsId ? hierarchyMap[viewAsId]?.role === 'admin' : isAdmin;

      if (!effectiveIsAdmin) {
        // Sub-admins (real or previewed via view_as) may only touch users
        // within their own downline (or themselves).
        const downline = computeDownline(effectiveId, rows);
        if (!downline.has(user_id)) {
          return ok({ error: "Forbidden — that user isn't on your team" });
        }
        // No privilege escalation: a sub-admin can never grant admin or sub-admin role.
        if (role && ['admin', 'sub-admin'].includes(role)) {
          return ok({ error: "Forbidden — only an admin can grant admin or sub-admin access" });
        }
        // A sub-admin may only re-point reports_to at someone inside their own downline.
        if (reports_to && !downline.has(reports_to)) {
          return ok({ error: "Forbidden — can only reassign within your own team" });
        }
      }

      const upsertRow: Record<string, unknown> = { user_id };
      if (role !== undefined) upsertRow.role = role;
      if (full_name !== undefined) upsertRow.full_name = full_name;
      if (region !== undefined) upsertRow.region = region;
      if (reports_to !== undefined) upsertRow.reports_to = reports_to || null;

      const { error } = await admin.from("org_hierarchy").upsert(upsertRow, { onConflict: "user_id" });
      if (error) return ok({ error: error.message });

      return ok({ ok: true });
    }

    return ok({ error: "Unknown action" });

  } catch (e) {
    return ok({ error: (e as Error).message });
  }
});
