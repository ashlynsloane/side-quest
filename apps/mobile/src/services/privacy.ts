import { FunctionsHttpError } from '@supabase/supabase-js';
import { disconnectStrava } from './strava';
import { supabase } from './supabase';

export async function deleteCloudSideQuestData():Promise<void>{
  if(!supabase)throw new Error('Cloud services are not configured.');
  try{await disconnectStrava()}catch{}
  const{error}=await supabase.rpc('delete_my_sidequest_cloud_data');
  if(error)throw new Error(error.message);
}

export async function deleteSideQuestAccount():Promise<void>{
  if(!supabase)throw new Error('Cloud services are not configured.');
  const{error}=await supabase.functions.invoke('delete-account',{body:{confirmation:'DELETE ACCOUNT'}});
  if(error){
    if(error instanceof FunctionsHttpError){try{const body=await error.context.json() as {error?:string};throw new Error(body.error??'Account deletion failed.')}catch(cause){if(cause instanceof Error)throw cause}}
    throw new Error(error.message);
  }
}
