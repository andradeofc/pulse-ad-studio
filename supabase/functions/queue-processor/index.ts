import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Queue Processor - Cron Job
 * 
 * This function is called by pg_cron every minute to:
 * 1. Check for queued or paused jobs that are ready to resume
 * 2. Check rate limit availability for each account
 * 3. Process items in batches respecting rate limits
 * 4. Pause jobs when rate limits are hit
 * 5. Resume jobs when rate limits reset
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// Rate limit configuration (Standard Access tier)
const RATE_LIMIT_CONFIG = {
  MAX_USAGE_PERCENT: 80, // Pause if usage exceeds this
  SAFE_USAGE_PERCENT: 50, // Resume when usage drops below this
  BATCH_SIZE: 25, // Process this many items per run
  WINDOW_MS: 5 * 60 * 1000, // 5 minute window
  MIN_DELAY_MS: 15, // Minimum delay between requests (~66 QPS to be safe)
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Job {
  id: string;
  user_id: string;
  status: string;
  config: Record<string, any>;
  processed_items: number;
  resume_after: string | null;
  last_rate_limit_percent: number;
}

// Parse rate limit from Facebook response header
function parseRateLimitHeader(header: string | null): number {
  if (!header) return 0;
  
  try {
    const parsed = JSON.parse(header);
    if (parsed.acc_id_util_pct !== undefined) {
      return parseFloat(parsed.acc_id_util_pct);
    }
  } catch {
    const match = header.match(/acc_id_util_pct["\s:]+(\d+(?:\.\d+)?)/);
    if (match) {
      return parseFloat(match[1]);
    }
  }
  return 0;
}

// Check current rate limit for an account
async function checkAccountRateLimit(
  accessToken: string,
  accountId: string
): Promise<{ available: boolean; usagePercent: number }> {
  try {
    const actId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
    const url = `${GRAPH_BASE_URL}/${actId}?fields=id&access_token=${accessToken}`;
    
    const res = await fetch(url, { method: 'GET' });
    const rateLimitHeader = res.headers.get('x-ad-account-usage') || res.headers.get('X-Ad-Account-Usage');
    const usagePercent = parseRateLimitHeader(rateLimitHeader);
    
    console.log(`[queue-processor] Account ${accountId} rate limit: ${usagePercent.toFixed(1)}%`);
    
    return {
      available: usagePercent < RATE_LIMIT_CONFIG.MAX_USAGE_PERCENT,
      usagePercent,
    };
  } catch (err) {
    console.error(`[queue-processor] Error checking rate limit:`, err);
    // Assume available if we can't check
    return { available: true, usagePercent: 0 };
  }
}

// Update rate limit tracking in database
async function updateRateLimitTracking(
  supabase: any,
  userId: string,
  accountId: string,
  usagePercent: number
): Promise<void> {
  const now = new Date().toISOString();
  
  await supabase
    .from('rate_limit_tracking')
    .upsert({
      user_id: userId,
      account_id: accountId,
      usage_percent: usagePercent,
      last_updated_at: now,
      request_count: 1,
    }, {
      onConflict: 'user_id,account_id',
    });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const now = new Date();
    console.log(`[queue-processor] Running at ${now.toISOString()}`);

    // Find jobs that are:
    // 1. Queued (not started yet)
    // 2. Paused but ready to resume (resume_after is in the past)
    // 3. Processing (might have been interrupted)
    const { data: jobs, error: jobsError } = await supabase
      .from('campaign_jobs')
      .select('*')
      .or(`status.eq.queued,status.eq.paused,status.eq.processing`)
      .order('created_at', { ascending: true })
      .limit(5); // Process up to 5 jobs per run

    if (jobsError) {
      console.error('[queue-processor] Error fetching jobs:', jobsError);
      throw jobsError;
    }

    if (!jobs || jobs.length === 0) {
      console.log('[queue-processor] No jobs to process');
      return new Response(JSON.stringify({ message: 'No jobs to process' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[queue-processor] Found ${jobs.length} job(s) to check`);

    const results: Array<{ jobId: string; status: string; message: string }> = [];

    for (const job of jobs as Job[]) {
      // Check if paused job should wait more
      if (job.status === 'paused' && job.resume_after) {
        const resumeTime = new Date(job.resume_after);
        if (now < resumeTime) {
          const waitMs = resumeTime.getTime() - now.getTime();
          console.log(`[queue-processor] Job ${job.id} waiting ${Math.round(waitMs / 1000)}s more`);
          results.push({ 
            jobId: job.id, 
            status: 'waiting', 
            message: `Waiting ${Math.round(waitMs / 1000)}s` 
          });
          continue;
        }
      }

      // Get the primary ad account to check rate limits
      const config = job.config as Record<string, any>;
      const selectedAccountIds = config.selectedAccounts || [];
      
      if (selectedAccountIds.length === 0) {
        console.log(`[queue-processor] Job ${job.id} has no accounts, marking failed`);
        await supabase
          .from('campaign_jobs')
          .update({ status: 'failed', error_message: 'No ad accounts configured' })
          .eq('id', job.id);
        results.push({ jobId: job.id, status: 'failed', message: 'No accounts' });
        continue;
      }

      // Get first account details
      const { data: account } = await supabase
        .from('facebook_ad_accounts')
        .select('id, account_id, profile_id')
        .eq('id', selectedAccountIds[0])
        .single();

      if (!account) {
        console.log(`[queue-processor] Job ${job.id} account not found`);
        results.push({ jobId: job.id, status: 'skipped', message: 'Account not found' });
        continue;
      }

      // Get access token securely
      const { data: credentials } = await supabase
        .from('facebook_credentials')
        .select('access_token')
        .eq('profile_id', account.profile_id)
        .single();

      // Fallback to facebook_profiles.access_token if credentials not found
      let accessToken: string | null = null;
      if (credentials?.access_token) {
        accessToken = credentials.access_token;
      } else {
        const { data: fallbackProfile } = await supabase
          .from('facebook_profiles')
          .select('access_token')
          .eq('id', account.profile_id)
          .single();
        accessToken = fallbackProfile?.access_token || null;
      }

      if (!accessToken) {
        console.log(`[queue-processor] Job ${job.id} no access token`);
        results.push({ jobId: job.id, status: 'skipped', message: 'No access token' });
        continue;
      }

      // Check rate limit before processing
      const rateCheck = await checkAccountRateLimit(accessToken, account.account_id);
      
      // Update tracking
      await updateRateLimitTracking(supabase, job.user_id, account.account_id, rateCheck.usagePercent);

      if (!rateCheck.available) {
        // Rate limit too high, pause the job
        const resumeAfter = new Date(now.getTime() + RATE_LIMIT_CONFIG.WINDOW_MS);
        
        await supabase
          .from('campaign_jobs')
          .update({ 
            status: 'paused',
            paused_at: now.toISOString(),
            resume_after: resumeAfter.toISOString(),
            last_rate_limit_percent: rateCheck.usagePercent,
          })
          .eq('id', job.id);

        console.log(`[queue-processor] Job ${job.id} paused until ${resumeAfter.toISOString()} (${rateCheck.usagePercent}% usage)`);
        results.push({ 
          jobId: job.id, 
          status: 'paused', 
          message: `Rate limit ${rateCheck.usagePercent.toFixed(1)}%, resuming in 5min` 
        });
        continue;
      }

      // Rate limit OK, trigger the job processor
      console.log(`[queue-processor] Triggering job ${job.id} (rate limit: ${rateCheck.usagePercent.toFixed(1)}%)`);
      
      // Call the main processor function
      // We use the service role to call it internally
      const processResponse = await supabase.functions.invoke('process-campaign-jobs', {
        body: { 
          job_id: job.id, 
          batch_mode: true,
          batch_size: RATE_LIMIT_CONFIG.BATCH_SIZE,
        },
      });

      if (processResponse.error) {
        console.error(`[queue-processor] Error processing job ${job.id}:`, processResponse.error);
        results.push({ jobId: job.id, status: 'error', message: processResponse.error.message });
      } else {
        const data = processResponse.data;
        results.push({ 
          jobId: job.id, 
          status: data?.status || 'processed', 
          message: data?.message || 'OK' 
        });
      }

      // Small delay between jobs
      await sleep(100);
    }

    console.log(`[queue-processor] Finished processing ${results.length} job(s)`);

    return new Response(JSON.stringify({ 
      success: true, 
      processed: results.length,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[queue-processor] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
