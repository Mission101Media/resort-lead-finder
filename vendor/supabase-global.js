(function () {
  if (window.supabase?.createClient) return;
  try {
    if (supabase?.createClient) {
      window.supabase = supabase;
    }
  } catch {
    window.supabase = null;
  }
})();
