// Grant or list payment review access for the isolated sandbox ledger.
//   PAYMENTS_SUPABASE_URL=... PAYMENTS_SUPABASE_SECRET_KEY=... \
//     node scripts/grant-payment-staff.mjs list
//     node scripts/grant-payment-staff.mjs grant tim@example.com "Refund and dispute review"
//     node scripts/grant-payment-staff.mjs revoke tim@example.com
// The account must already exist and have confirmed its email.
import { createClient } from "@supabase/supabase-js";

const TEST_PROJECT = "nzdiempfezheorauxmsb";
const [command, email, note = ""] = process.argv.slice(2);
const url = required("PAYMENTS_SUPABASE_URL");
const db = createClient(url, required("PAYMENTS_SUPABASE_SECRET_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });

if (new URL(url).hostname !== `${TEST_PROJECT}.supabase.co`) {
  exit(`Refusing to run: this script is for the isolated sandbox project ${TEST_PROJECT} only.`);
}

if (command === "list") {
  const { data, error } = await db.from("payment_staff").select("user_id,note,added_at").order("added_at");
  if (error) exit(error.message);
  if (!data.length) console.log("No accounts have payment review access.");
  for (const row of data) console.log(`${row.user_id}\t${await emailFor(row.user_id)}\t${row.added_at}\t${row.note}`);
} else if (command === "grant" || command === "revoke") {
  if (!email) exit("Pass the account email address.");
  const user = await userFor(email);
  if (command === "grant") {
    const { error } = await db.from("payment_staff").upsert({ user_id: user.id, note }, { onConflict: "user_id" });
    if (error) exit(error.message);
    console.log(`Granted payment review access to ${email} (${user.id}).`);
  } else {
    const { error } = await db.from("payment_staff").delete().eq("user_id", user.id);
    if (error) exit(error.message);
    console.log(`Removed payment review access from ${email} (${user.id}).`);
  }
} else {
  exit("Usage: grant-payment-staff.mjs list | grant <email> [note] | revoke <email>");
}

async function userFor(address) {
  const wanted = address.trim().toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) exit(error.message);
    const match = data.users.find(user => user.email?.toLowerCase() === wanted);
    if (match) {
      if (!match.email_confirmed_at) exit(`${address} has not confirmed its email yet; the review queue would refuse it.`);
      return match;
    }
    if (data.users.length < 200) break;
  }
  return exit(`No account exists for ${address} in this project.`);
}
async function emailFor(id) {
  const { data } = await db.auth.admin.getUserById(id);
  return data?.user?.email ?? "unknown";
}
function required(name) {
  const value = process.env[name];
  if (!value) exit(`Missing environment variable: ${name}`);
  return value;
}
function exit(message) {
  console.error(message);
  process.exit(1);
}
