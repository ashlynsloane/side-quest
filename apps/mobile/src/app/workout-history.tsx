import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ActionCard, AppScreen, Pill, SectionTitle, Surface } from '@/components/v12-ui';
import { listWorkoutLedgerEntries, type WorkoutLedgerEntry } from '@/services/database';
import { useTheme } from '@/state/theme-context';
import { typography, type AppPalette } from '@/theme';

export default function WorkoutHistoryScreen(){const router=useRouter();const{palette}=useTheme();const styles=useMemo(()=>makeStyles(palette),[palette]);const[entries,setEntries]=useState<WorkoutLedgerEntry[]>([]);useFocusEffect(useCallback(()=>{void listWorkoutLedgerEntries({limit:200}).then(setEntries)},[]));return <AppScreen eyebrow="WORKOUT HISTORY" title="Everything you actually completed" subtitle="Planned, generated, class, and outside workouts all live in one editable ledger. Training memory is rebuilt whenever a record changes.">
<ActionCard icon="＋" title="Log another workout" body="Dictate or type a class or outside strength session, then review the interpretation." onPress={()=>router.push('/log-workout' as Href)} badge="DICTATE"/>
<SectionTitle detail={`${entries.length} workouts`}>Completed workouts</SectionTitle>
{entries.length===0?<Surface><Text style={styles.helper}>No completed strength workouts have been logged yet.</Text></Surface>:null}
{entries.map(entry=><Pressable key={entry.id} onPress={()=>router.push({pathname:'/workout-detail',params:{id:entry.id}} as never)} style={({pressed})=>[styles.card,pressed&&styles.pressed]}><View style={styles.top}><View style={{flex:1}}><Text style={styles.name}>{entry.name}</Text><Text style={styles.date}>{formatDate(entry.completedAt)}</Text></View><Pill tone={entry.source==='side_quest'?'good':'neutral'}>{sourceLabel(entry.source)}</Pill><Text style={styles.chevron}>›</Text></View><Text style={styles.meta}>{entry.exercises.length} exercises · {entry.exercises.reduce((sum,item)=>sum+item.sets.filter(set=>set.completed).length,0)} sets · {Math.round(entry.completionFraction*100)}% completed</Text>{entry.relationToPlan==='replaced_planned'?<Text style={styles.replaced}>Replaced a planned strength session</Text>:null}</Pressable>)}
</AppScreen>}
function sourceLabel(value:WorkoutLedgerEntry['source']){return value==='side_quest'?'Side Quest':value==='workout_together'?'Together':value.replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase())}
function formatDate(value:string){return new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value))}
function makeStyles(palette:AppPalette){return StyleSheet.create({card:{backgroundColor:palette.surface,borderWidth:1,borderColor:palette.border,borderRadius:18,padding:15,gap:7},pressed:{opacity:.7},top:{flexDirection:'row',alignItems:'center',gap:8},name:{fontSize:17,fontWeight:'900',color:palette.ink},date:{...typography.small,color:palette.inkMuted},meta:{...typography.small,color:palette.ink},replaced:{fontSize:11,fontWeight:'800',color:palette.forest},chevron:{fontSize:25,color:palette.forest},helper:{...typography.small,color:palette.inkMuted}})}
