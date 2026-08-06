import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { cloudAuthConfigured, supabase } from '@/services/supabase';
import { activateUserDatabase } from '@/services/database';
import { syncProfileWithFallback } from '@/services/reliability';
import type { AppearanceMode, ThemeId } from '@/theme';

export interface BetaProfile { id:string; email:string; displayName:string; initials:string; mode:'cloud'|'local'; units:'lb'|'kg'; anatomyFigure:'woman'|'man'; themeId:ThemeId; appearance:AppearanceMode; createdAt:string; }
interface AuthValue { user:BetaProfile|null; loading:boolean; cloudEnabled:boolean; requestOtp(email:string):Promise<void>; verifyOtp(email:string,token:string,displayName:string):Promise<void>; continueLocal(input:{email:string;displayName:string;inviteCode?:string}):Promise<void>; updateProfile(patch:Partial<Pick<BetaProfile,'displayName'|'units'|'anatomyFigure'|'themeId'|'appearance'>>):Promise<void>; signOut():Promise<void>; }
const KEY='circuit.v12.beta-profile';
const AuthContext=createContext<AuthValue|null>(null);
const store=(globalThis as typeof globalThis & { localStorage:{getItem(k:string):string|null;setItem(k:string,v:string):void;removeItem(k:string):void} }).localStorage;

function initials(name:string,email:string){ const source=name.trim()||email.split('@')[0]||'A'; return source.split(/\s+/).slice(0,2).map(x=>x[0]?.toUpperCase()??'').join('')||'A'; }
function fromCloud(user:User, saved?:BetaProfile|null):BetaProfile { const displayName=String(user.user_metadata?.display_name||saved?.displayName||user.email?.split('@')[0]||'Athlete'); return {id:user.id,email:user.email??saved?.email??'',displayName,initials:initials(displayName,user.email??''),mode:'cloud',units:saved?.units??'lb',anatomyFigure:(user.user_metadata?.anatomy_figure as BetaProfile['anatomyFigure']|undefined)??saved?.anatomyFigure??'woman',themeId:(user.user_metadata?.theme_id as ThemeId|undefined)??saved?.themeId??'forest',appearance:(user.user_metadata?.appearance as AppearanceMode|undefined)??saved?.appearance??'system',createdAt:saved?.createdAt??user.created_at??new Date().toISOString()}; }
function readSaved(){ try { const raw=store.getItem(KEY); if(!raw)return null; const parsed=JSON.parse(raw) as Partial<BetaProfile>; return {...parsed,anatomyFigure:parsed.anatomyFigure??'woman',themeId:parsed.themeId??'forest',appearance:parsed.appearance??'system'} as BetaProfile; } catch{return null;} }
function persist(value:BetaProfile|null){ if(value) store.setItem(KEY,JSON.stringify(value)); else store.removeItem(KEY); }

export function AuthProvider({children}:{children:ReactNode}){
 const [user,setUser]=useState<BetaProfile|null>(null); const [loading,setLoading]=useState(true);
 useEffect(()=>{ let active=true; const saved=readSaved(); if(!supabase){void (async()=>{if(saved)await activateUserDatabase(saved.id);setUser(saved);setLoading(false);})();return;}
   void supabase.auth.getSession().then(async ({data}:{data:{session:Session|null}})=>{if(!active)return; const next=data.session?.user?fromCloud(data.session.user,saved):saved?.mode==='local'?saved:null;if(next)await activateUserDatabase(next.id);setUser(next);if(next)persist(next);setLoading(false);});
   const {data:sub}=supabase.auth.onAuthStateChange((_event:AuthChangeEvent,session:Session|null)=>{void (async()=>{const next=session?.user?fromCloud(session.user,readSaved()):null;if(next)await activateUserDatabase(next.id);setUser(next);persist(next);setLoading(false);})();});
   return()=>{active=false;sub.subscription.unsubscribe();};
 },[]);
 const requestOtp=useCallback(async(email:string)=>{if(!supabase)throw new Error('Cloud login is not configured for this beta build.'); const {error}=await supabase.auth.signInWithOtp({email:email.trim(),options:{shouldCreateUser:true}}); if(error)throw error;},[]);
 const verifyOtp=useCallback(async(email:string,token:string,displayName:string)=>{if(!supabase)throw new Error('Cloud login is not configured.'); const {data,error}=await supabase.auth.verifyOtp({email:email.trim(),token:token.trim(),type:'email'}); if(error)throw error; if(!data.user)throw new Error('No account was returned.'); if(displayName.trim()) await supabase.auth.updateUser({data:{display_name:displayName.trim()}}); const next=fromCloud({...data.user,user_metadata:{...data.user.user_metadata,display_name:displayName.trim()||data.user.user_metadata?.display_name}}); await activateUserDatabase(next.id); setUser(next);persist(next); try{await supabase.from('profiles').upsert({id:next.id,email:next.email,display_name:next.displayName,units:next.units,theme_id:next.themeId,appearance:next.appearance,updated_at:new Date().toISOString()});}catch{} },[]);
 const continueLocal=useCallback(async({email,displayName,inviteCode}:{email:string;displayName:string;inviteCode?:string})=>{const required=process.env.EXPO_PUBLIC_BETA_INVITE_CODE?.trim();if(required&&inviteCode?.trim()!==required)throw new Error('That beta invite code is not valid.'); const cleanEmail=email.trim().toLowerCase();const cleanName=displayName.trim()||cleanEmail.split('@')[0]||'Athlete';const next:BetaProfile={id:`local_${cleanEmail||Date.now()}`,email:cleanEmail,displayName:cleanName,initials:initials(cleanName,cleanEmail),mode:'local',units:'lb',anatomyFigure:'woman',themeId:'forest',appearance:'system',createdAt:new Date().toISOString()};await activateUserDatabase(next.id);setUser(next);persist(next);},[]);
 const updateProfile=useCallback(async(patch:Partial<Pick<BetaProfile,'displayName'|'units'|'anatomyFigure'|'themeId'|'appearance'>>)=>{if(!user)return;const next={...user,...patch,initials:initials(patch.displayName??user.displayName,user.email)};setUser(next);persist(next);if(next.mode==='cloud'&&supabase){void syncProfileWithFallback({userId:next.id,email:next.email,displayName:next.displayName,units:next.units,anatomyFigure:next.anatomyFigure,themeId:next.themeId,appearance:next.appearance}).catch(()=>undefined);}},[user]);
 const signOut=useCallback(async()=>{if(supabase)await supabase.auth.signOut();setUser(null);persist(null);},[]);
 const value=useMemo<AuthValue>(()=>({user,loading,cloudEnabled:cloudAuthConfigured,requestOtp,verifyOtp,continueLocal,updateProfile,signOut}),[user,loading,requestOtp,verifyOtp,continueLocal,updateProfile,signOut]);
 return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth(){const value=useContext(AuthContext);if(!value)throw new Error('useAuth must be used inside AuthProvider');return value;}
