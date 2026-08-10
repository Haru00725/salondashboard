require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function testSupabase() {
  console.log("Testing Supabase connection...");
  
  // Test 1: Fetch all bookings without date filter to see if the table works
  const { data, error } = await supabase.from('bookings').select('*').limit(5);
  
  if (error) {
    console.error("Error fetching bookings:", error.message);
    return;
  }
  
  console.log(`Successfully connected. Found ${data.length} bookings.`);
  if (data.length > 0) {
    console.log("Sample booking:", JSON.stringify(data[0], null, 2));
  } else {
    console.log("The bookings table is empty.");
  }
}

testSupabase();
