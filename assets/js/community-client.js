let pending;
export function getCommunityClient(){
  if(!pending)pending=(async()=>{
    if(!globalThis.supabase?.createClient)throw new Error('The community service could not load. Reload to reconnect.');
    const response=await fetch(new URL('../../data/community-auth.json',import.meta.url),{cache:'no-store'});
    if(!response.ok)throw new Error('Community connection unavailable.');
    const config=await response.json();
    if(!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(config.projectUrl)||!/^sb_publishable_[a-zA-Z0-9_-]+$/.test(config.publishableKey))throw new Error('Community connection is not configured.');
    return globalThis.supabase.createClient(config.projectUrl,config.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'kipg-community-auth'}});
  })().catch(error=>{pending=null;throw error;});
  return pending;
}
export function communityError(error){
  if(error?.code==='over_email_send_rate_limit'||error?.status===429)return 'Please wait a little before requesting another sign-in email.';
  if(error?.code==='email_address_not_authorized')return 'Email delivery is still being set up for community members.';
  return error?.message || 'We could not complete that request. Please try again.';
}
