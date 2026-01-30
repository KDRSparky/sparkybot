-- SparkyBot: Enable 30-day conversation cleanup
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)

-- The cleanup function already exists in schema.sql:
-- cleanup_old_conversations() deletes conversations older than 30 days

-- Option 1: Use Supabase's pg_cron extension (if available on your plan)
-- Enable the extension first (requires Pro plan or higher)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily cleanup at 3 AM UTC
-- SELECT cron.schedule(
--   'cleanup-old-conversations',
--   '0 3 * * *',
--   'SELECT cleanup_old_conversations()'
-- );

-- Option 2: Create a database function that can be called via HTTP
-- This works on all Supabase plans and can be triggered by Cloudflare Worker

CREATE OR REPLACE FUNCTION public.run_cleanup()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Count records to be deleted
  SELECT COUNT(*) INTO deleted_count
  FROM conversations
  WHERE created_at < NOW() - INTERVAL '30 days';
  
  -- Delete old conversations
  DELETE FROM conversations
  WHERE created_at < NOW() - INTERVAL '30 days';
  
  -- Return result
  RETURN json_build_object(
    'success', true,
    'deleted_count', deleted_count,
    'executed_at', NOW()
  );
END;
$$;

-- Grant execute permission to the service role
GRANT EXECUTE ON FUNCTION public.run_cleanup() TO service_role;

-- Test the function (optional)
-- SELECT run_cleanup();

-- To call this from Cloudflare Worker or any HTTP client:
-- POST https://your-project.supabase.co/rest/v1/rpc/run_cleanup
-- Headers: 
--   apikey: your-service-role-key
--   Authorization: Bearer your-service-role-key
--   Content-Type: application/json
