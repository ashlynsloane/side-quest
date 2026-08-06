import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { corsHeaders, json } from '../_shared/cors.ts';
import { admin, HttpError, requireUser } from '../_shared/supabase.ts';
import { validAccessToken } from '../_shared/strava.ts';

const url=Deno.env.get('SUPABASE_URL');
const anonKey=Deno.env.get('SUPABASE_ANON_KEY');
if(!url||!anonKey)throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required.');

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
  try{
    if(req.method!=='POST')throw new HttpError(405,'Method not allowed.');
    const user=await requireUser(req);
    const body=await req.json().catch(()=>({})) as {confirmation?:string};
    if(body.confirmation!=='DELETE ACCOUNT')throw new HttpError(400,'Explicit account-deletion confirmation is required.');
    try{const{token}=await validAccessToken(user.id);await fetch('https://www.strava.com/oauth/deauthorize',{method:'POST',headers:{Authorization:`Bearer ${token}`}})}catch{}
    const authorization=req.headers.get('Authorization')??'';
    const scoped=createClient(url,anonKey,{auth:{autoRefreshToken:false,persistSession:false},global:{headers:{Authorization:authorization}}});
    const{error:cleanupError}=await scoped.rpc('delete_my_sidequest_cloud_data');
    if(cleanupError)throw cleanupError;
    const{error:deleteError}=await admin.auth.admin.deleteUser(user.id,false);
    if(deleteError)throw deleteError;
    return json({deleted:true});
  }catch(error){const status=error instanceof HttpError?error.status:500;console.error('delete-account failed',error instanceof Error?error.message:String(error));return json({error:error instanceof Error?error.message:String(error)},status)}
});
