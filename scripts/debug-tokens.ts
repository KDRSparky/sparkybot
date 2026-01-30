import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("Supabase URL:", supabaseUrl ? "✅ Set" : "❌ Missing");
console.log("Supabase Key:", supabaseKey ? "✅ Set" : "❌ Missing");

if (supabaseUrl && supabaseKey) {
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  const { data, error } = await supabase
    .from("preferences")
    .select("*")
    .eq("category", "google_oauth");
  
  if (error) {
    console.log("Error:", error.message);
  } else {
    console.log("\nFound", data?.length || 0, "OAuth records:");
    data?.forEach(record => {
      console.log("  -", record.key, ":", record.value?.email || "no email");
    });
  }
}
